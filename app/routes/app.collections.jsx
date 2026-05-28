import { getCurrentPlan } from "../models/plans.server";
import db from "../db.server";
import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
} from "react-router";
import { useMemo, useState } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Select,
  EmptyState,
  Banner,
  TextField,
  IndexTable,
  Pagination,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

const FREE_COLLECTION_LIMIT = 10;
const PAGE_SIZE = 25;

function sortProducts(products, rule) {
  const sorted = [...products];

  if (rule === "price_high_low") {
    sorted.sort((a, b) => Number(b.price) - Number(a.price));
  }

  if (rule === "price_low_high") {
    sorted.sort((a, b) => Number(a.price) - Number(b.price));
  }

  if (rule === "inventory_high_low") {
    sorted.sort(
      (a, b) => Number(b.totalInventory || 0) - Number(a.totalInventory || 0),
    );
  }

  if (rule === "inventory_low_high") {
    sorted.sort(
      (a, b) => Number(a.totalInventory || 0) - Number(b.totalInventory || 0),
    );
  }

  if (rule === "newest_first") {
    sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (rule === "oldest_first") {
    sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  if (rule === "title_az") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  }

  if (rule === "title_za") {
    sorted.sort((a, b) => b.title.localeCompare(a.title));
  }

  if (rule === "randomize") {
    sorted.sort(() => Math.random() - 0.5);
  }

  return sorted;
}

function buildSequentialMoves(currentProducts, sortedProducts) {
  const currentIds = currentProducts.map((product) => product.id);
  const targetIds = sortedProducts.map((product) => product.id);
  const moves = [];

  targetIds.forEach((targetId, targetIndex) => {
    const currentIndex = currentIds.indexOf(targetId);

    if (currentIndex !== targetIndex) {
      moves.push({
        id: targetId,
        newPosition: String(targetIndex),
      });

      currentIds.splice(currentIndex, 1);
      currentIds.splice(targetIndex, 0, targetId);
    }
  });

  return moves;
}

function getNextRunDate(schedule) {
  const now = new Date();

  if (schedule === "hourly") {
    now.setHours(now.getHours() + 1);
    return now;
  }

  if (schedule === "daily") {
    now.setDate(now.getDate() + 1);
    return now;
  }

  return null;
}

function shouldRunRule(rule) {
  if (!rule.isActive) return false;
  if (rule.schedule === "manual") return false;
  if (!rule.nextRunAt) return true;

  const now = new Date();
  const nextRun =
    rule.nextRunAt instanceof Date
      ? rule.nextRunAt
      : new Date(rule.nextRunAt);

  if (Number.isNaN(nextRun.getTime())) {
    return true;
  }

  return nextRun.getTime() <= now.getTime();
}

function safeJsonParse(value, fallback = []) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function humanRule(rule) {
  const labels = {
    inventory_high_low: "Sort by inventory highest first",
    inventory_low_high: "Sort by inventory lowest first",
    price_high_low: "Sort by price highest first",
    price_low_high: "Sort by price lowest first",
    newest_first: "Sort by newest products",
    oldest_first: "Sort by oldest products",
    title_az: "Sort by title A-Z",
    title_za: "Sort by title Z-A",
    randomize: "Randomize products",
  };

  return labels[rule] || rule;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

async function fetchCollectionWithProducts(admin, collectionId) {
  const response = await admin.graphql(
    `
      query GetCollectionProducts($id: ID!) {
        collection(id: $id) {
          id
          title
          handle
          sortOrder
          productsCount {
            count
          }
          products(first: 100) {
            edges {
              node {
                id
                title
                handle
                status
                totalInventory
                createdAt
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        id: collectionId,
      },
    },
  );

  const data = await response.json();
  const collection = data?.data?.collection;

  if (!collection) {
    return {
      collection: null,
      products: [],
    };
  }

  const products =
    collection.products?.edges?.map((edge) => {
      const product = edge.node;

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        totalInventory: product.totalInventory || 0,
        createdAt: product.createdAt,
        price: product.priceRangeV2?.minVariantPrice?.amount || "0.00",
        currency: product.priceRangeV2?.minVariantPrice?.currencyCode || "",
      };
    }) || [];

  return {
    collection: {
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      sortOrder: collection.sortOrder,
      productsCount: collection.productsCount?.count || 0,
    },
    products,
  };
}

async function reorderCollection(admin, collectionId, rule) {
  const result = await fetchCollectionWithProducts(admin, collectionId);

  if (!result.collection) {
    return {
      ok: false,
      title: "Unknown collection",
      message: "Collection not found.",
    };
  }

  if (result.collection.sortOrder !== "MANUAL") {
    return {
      ok: false,
      title: result.collection.title,
      message: "Skipped because collection sort order is not manual.",
    };
  }

  const sortedProducts = sortProducts(result.products, rule);
  const moves = buildSequentialMoves(result.products, sortedProducts);

  if (moves.length === 0) {
    return {
      ok: true,
      title: result.collection.title,
      message: "Already sorted. No changes needed.",
    };
  }

  const reorderResponse = await admin.graphql(
    `
      mutation ReorderCollectionProducts($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        id: collectionId,
        moves,
      },
    },
  );

  const reorderData = await reorderResponse.json();

  if (reorderData.errors?.length) {
    return {
      ok: false,
      title: result.collection.title,
      message: reorderData.errors.map((error) => error.message).join(", "),
    };
  }

  const userErrors =
    reorderData?.data?.collectionReorderProducts?.userErrors || [];

  if (userErrors.length > 0) {
    return {
      ok: false,
      title: result.collection.title,
      message: userErrors.map((error) => error.message).join(", "),
    };
  }

  return {
    ok: true,
    title: result.collection.title,
    message: `${moves.length} product move(s) sent to Shopify.`,
  };
}

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const currentPlan = await getCurrentPlan(admin);

  const url = new URL(request.url);
  const selectedCollectionIds = url.searchParams.getAll("collectionIds");
  const selectedRule = url.searchParams.get("rule") || "inventory_high_low";

  const collectionSettings = await db.collectionSetting.findMany({
  where: {
    shop: session.shop,
  },
});
  
  const collectionsResponse = await admin.graphql(`
    query GetCollections {
      collections(first: 100) {
        edges {
          node {
            id
            title
            handle
            sortOrder
            productsCount {
              count
            }
          }
        }
      }
    }
  `);

  const collectionsData = await collectionsResponse.json();

  const collections =
    collectionsData?.data?.collections?.edges?.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      sortOrder: edge.node.sortOrder,
      productsCount: edge.node.productsCount?.count || 0,
    })) || [];

  const defaultSelectedIds =
    selectedCollectionIds.length > 0
      ? selectedCollectionIds
      : [];

  const savedRules = await db.sortingRule.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const executionLogs = await db.ruleExecutionLog.findMany({
    where: {
      sortingRule: {
        shop: session.shop,
      },
    },
    include: {
      sortingRule: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

  return {
    collections,
    collectionSettings,
    selectedCollectionIds: defaultSelectedIds,
    selectedRule,
    savedRules,
    executionLogs,
    plan: {
      name: currentPlan.name,
      collectionLimit: currentPlan.limit,
    },
  };
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const currentPlan = await getCurrentPlan(admin);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_collection_settings") {
  const enabledIds = formData.getAll("enabledCollectionIds");
  const selectedRule = String(formData.get("rule") || "inventory_high_low");

  for (const collectionId of enabledIds) {
    await db.collectionSetting.upsert({
      where: {
        shop_collectionId: {
          shop: session.shop,
          collectionId,
        },
      },
      update: {
        isEnabled: true,
        rule: selectedRule,
      },
      create: {
        shop: session.shop,
        collectionId,
        isEnabled: true,
        rule: selectedRule,
      },
    });
  }

  await db.collectionSetting.updateMany({
    where: {
      shop: session.shop,
      collectionId: {
        notIn: enabledIds,
      },
    },
    data: {
      isEnabled: false,
    },
  });

  return {
    ok: true,
    message: "Collection sorting settings saved.",
    results: [],
  };
}

  if (intent === "run_due_rules") {
    const activeRules = await db.sortingRule.findMany({
      where: {
        shop: session.shop,
        isActive: true,
      },
      orderBy: {
        nextRunAt: "asc",
      },
    });

    const dueRules = activeRules.filter(shouldRunRule);
    const results = [];

    for (const savedRule of dueRules) {
      const log = await db.ruleExecutionLog.create({
        data: {
          sortingRuleId: savedRule.id,
          status: "running",
          message: "Rule execution started.",
        },
      });

      try {
        const selectedCollectionIds = safeJsonParse(savedRule.collectionIds, []);
        const collectionResults = [];

        for (const collectionId of selectedCollectionIds) {
          const result = await reorderCollection(
            admin,
            collectionId,
            savedRule.rule,
          );
          collectionResults.push(result);
        }

        const successCount = collectionResults.filter((item) => item.ok).length;
        const failedCount = collectionResults.length - successCount;
        const finalStatus = failedCount === 0 ? "success" : "partial";

        await db.ruleExecutionLog.update({
          where: {
            id: log.id,
          },
          data: {
            status: finalStatus,
            message: `${successCount} collection(s) processed. ${failedCount} skipped or failed.`,
            completedAt: new Date(),
          },
        });

        await db.sortingRule.update({
          where: {
            id: savedRule.id,
          },
          data: {
            lastRunAt: new Date(),
            nextRunAt: getNextRunDate(savedRule.schedule),
          },
        });

        results.push({
          ok: failedCount === 0,
          title: savedRule.name,
          message: `${successCount} collection(s) processed. ${failedCount} skipped or failed.`,
        });
      } catch (error) {
        await db.ruleExecutionLog.update({
          where: {
            id: log.id,
          },
          data: {
            status: "failed",
            message: error.message || "Rule execution failed.",
            completedAt: new Date(),
          },
        });

        results.push({
          ok: false,
          title: savedRule.name,
          message: error.message || "Rule execution failed.",
        });
      }
    }

    return {
      ok: results.every((item) => item.ok),
      message:
        dueRules.length === 0
          ? "No due automation rules found."
          : `${dueRules.length} automation rule(s) executed.`,
      results,
    };
  }

  if (intent === "toggle_rule") {
    const ruleId = Number(formData.get("ruleId"));

    const savedRule = await db.sortingRule.findFirst({
      where: {
        id: ruleId,
        shop: session.shop,
      },
    });

    if (!savedRule) {
      return {
        ok: false,
        message: "Rule not found.",
        results: [],
      };
    }

    const nextActiveState = !savedRule.isActive;

    await db.sortingRule.update({
      where: {
        id: savedRule.id,
      },
      data: {
        isActive: nextActiveState,
        nextRunAt: nextActiveState
          ? getNextRunDate(savedRule.schedule)
          : null,
      },
    });

    return {
      ok: true,
      message: nextActiveState
        ? "Rule activated successfully."
        : "Rule paused successfully.",
      results: [],
    };
  }

  const collectionIds = formData.getAll("collectionIds");
  const rule = formData.get("rule");

  if (!collectionIds.length || !rule) {
    return {
      ok: false,
      message: "Select at least one collection and sorting rule.",
      results: [],
    };
  }

  if (collectionIds.length > currentPlan.limit) {
    return {
      ok: false,
      message: `${currentPlan.name} plan allows up to ${currentPlan.limit} collections.`,
      results: [],
    };
  }

  if (intent === "save_rule") {
    const ruleName = String(formData.get("ruleName") || "").trim();
    const schedule = String(formData.get("schedule") || "manual");

    if (!ruleName) {
      return {
        ok: false,
        message: "Rule name is required.",
        results: [],
      };
    }

    const existingRules = await db.sortingRule.findMany({
      where: {
        shop: session.shop,
      },
    });

    const normalizedName = ruleName.toLowerCase();
    const normalizedSelectedCollections = JSON.stringify([...collectionIds].sort());

    const duplicateName = existingRules.find(
      (savedRule) => savedRule.name.toLowerCase() === normalizedName,
    );

    if (duplicateName) {
      return {
        ok: false,
        message: "A sorting rule with this name already exists.",
        results: [],
      };
    }

    const duplicateRuleSetup = existingRules.find((savedRule) => {
      const savedCollections = JSON.stringify(
        safeJsonParse(savedRule.collectionIds, []).sort(),
      );

      return (
        savedRule.rule === rule &&
        savedRule.schedule === schedule &&
        savedCollections === normalizedSelectedCollections
      );
    });

    if (duplicateRuleSetup) {
      return {
        ok: false,
        message:
          "A sorting rule with the same collections, sorting rule, and schedule already exists.",
        results: [],
      };
    }

    await db.sortingRule.create({
      data: {
        shop: session.shop,
        name: ruleName,
        rule,
        collectionIds: JSON.stringify(collectionIds),
        schedule,
        isActive: schedule !== "manual",
        nextRunAt: getNextRunDate(schedule),
      },
    });

    return {
      ok: true,
      message: "Sorting rule saved successfully.",
      results: [],
    };
  }

  const results = [];

  for (const collectionId of collectionIds) {
    const result = await reorderCollection(admin, collectionId, rule);
    results.push(result);
  }

  const successCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - successCount;

  return {
    ok: failedCount === 0,
    message: `${successCount} collection(s) processed successfully. ${failedCount} skipped or failed.`,
    results,
  };
}

export default function CollectionsPage() {
  const {
    collections,
    selectedCollectionIds,
    selectedRule,
    savedRules,
    plan,
    collectionSettings,
  } = useLoaderData();

  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const enabledFromDb = collectionSettings
  .filter((setting) => setting.isEnabled)
  .map((setting) => setting.collectionId);

  const [enabledCollectionIds, setEnabledCollectionIds] = useState(enabledFromDb);
  const [rule, setRule] = useState(selectedRule);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  const isApplying = navigation.state === "submitting";

  const activeRuleCount = savedRules.filter(
    (savedRule) => savedRule.isActive,
  ).length;

  const manualCollectionCount = collections.filter(
    (collection) => collection.sortOrder === "MANUAL",
  ).length;

  const ruleOptions = [
    { label: "Inventory: High to Low", value: "inventory_high_low" },
    { label: "Inventory: Low to High", value: "inventory_low_high" },
    { label: "Price: High to Low", value: "price_high_low" },
    { label: "Price: Low to High", value: "price_low_high" },
    { label: "Newest Products First", value: "newest_first" },
    { label: "Oldest Products First", value: "oldest_first" },
    { label: "Title: A to Z", value: "title_az" },
    { label: "Title: Z to A", value: "title_za" },
    { label: "Randomize Products", value: "randomize" },
  ];

  const filterOptions = [
    { label: "All collections", value: "all" },
    { label: "Manual only", value: "manual" },
    { label: "Not manual", value: "not_manual" },
    { label: "Enabled", value: "enabled" },
    { label: "Disabled", value: "disabled" },
  ];

  const filteredCollections = useMemo(() => {
    return collections.filter((collection) => {
      const matchesQuery =
        !query ||
        collection.title.toLowerCase().includes(query.toLowerCase()) ||
        collection.handle.toLowerCase().includes(query.toLowerCase());

      const enabled = enabledCollectionIds.includes(collection.id);
      const manual = collection.sortOrder === "MANUAL";

      const matchesFilter =
        filter === "all" ||
        (filter === "manual" && manual) ||
        (filter === "not_manual" && !manual) ||
        (filter === "enabled" && enabled) ||
        (filter === "disabled" && !enabled);

      return matchesQuery && matchesFilter;
    });
  }, [collections, enabledCollectionIds, filter, query]);

  const [selectedResources, setSelectedResources] = useState([]);

  const selectedCollectionCount = selectedResources.length;

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCollections.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, totalPages);

  const pagedCollections = filteredCollections.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const selectedManualCount = collections.filter(
    (collection) =>
      selectedResources.includes(collection.id) &&
      collection.sortOrder === "MANUAL",
  ).length;

  const pagedCollectionIds = pagedCollections.map((collection) => collection.id);

  const allVisibleSelected =
    pagedCollectionIds.length > 0 &&
    pagedCollectionIds.every((id) => selectedResources.includes(id));

  const someVisibleSelected =
    pagedCollectionIds.some((id) => selectedResources.includes(id)) &&
    !allVisibleSelected;

  function clearSelection() {
    setSelectedResources([]);
  }

  function toggleSelectedCollection(id) {
    setSelectedResources((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      return [...current, id];
    });
  }

  function toggleSelectVisible() {
    setSelectedResources((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !pagedCollectionIds.includes(id));
      }

      return Array.from(new Set([...current, ...pagedCollectionIds]));
    });
  }

  function limitEnabledIds(nextIds) {
    return nextIds.slice(0, plan.collectionLimit);
  }

  function toggleCollectionEnabled(id) {
    setEnabledCollectionIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= plan.collectionLimit) {
        return current;
      }

      return [...current, id];
    });
  }

  function enableSelectedCollections() {
    setEnabledCollectionIds((current) => {
      const nextIds = Array.from(new Set([...current, ...selectedResources]));
      return limitEnabledIds(nextIds);
    });
  }

  function disableSelectedCollections() {
    setEnabledCollectionIds((current) =>
      current.filter((id) => !selectedResources.includes(id)),
    );
  }

  function submitCollections(method, intent = "apply_sorting", specificIds = null) {
    const formData = new FormData();
    const targetIds = specificIds || selectedResources;

    targetIds.forEach((id) => {
      formData.append("collectionIds", id);
    });

    formData.set("rule", rule);
    formData.set("intent", intent);

    submit(formData, { method });
  }


  return (
    <Page
      title="Collections"
      subtitle="Manage collection merchandising"
      fullWidth
    >
      <BlockStack gap="400">
        {actionData ? (
          <Banner
            tone={actionData.ok ? "success" : "warning"}
            title="Bulk sorting result"
          >
            <p>{actionData.message}</p>
          </Banner>
        ) : null}

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="600" wrap>
              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  Plan
                </Text>
                <InlineStack gap="100" blockAlign="center">
                  <Text as="p" fontWeight="semibold">
                    {plan.name}
                  </Text>
                  <Badge tone="info">
                    {enabledCollectionIds.length}/{plan.collectionLimit} enabled
                  </Badge>
                </InlineStack>
              </BlockStack>

              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  Collections
                </Text>
                <InlineStack gap="100" blockAlign="center">
                  <Text as="p" fontWeight="semibold">
                    {collections.length}
                  </Text>
                  <Badge tone="success">{manualCollectionCount} manual</Badge>
                </InlineStack>
              </BlockStack>

              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  Strategies
                </Text>
                <InlineStack gap="100" blockAlign="center">
                  <Text as="p" fontWeight="semibold">
                    {savedRules.length}
                  </Text>
                  <Badge tone="success">{activeRuleCount} active</Badge>
                </InlineStack>
              </BlockStack>

              <BlockStack gap="050">
                <Text as="p" tone="subdued">
                  Selected
                </Text>
                <Text as="p" fontWeight="semibold">
                  {selectedCollectionCount}
                </Text>
              </BlockStack>
            </InlineStack>

            {selectedCollectionCount > 0 ? (
              <InlineStack gap="200">
                <Button onClick={enableSelectedCollections}>
                  Enable sorting
                </Button>

                <Button onClick={disableSelectedCollections}>
                  Disable sorting
                </Button>

                <Button
                  variant="primary"
                  loading={isApplying}
                  onClick={() => submitCollections("post", "apply_sorting")}
                >
                  Sort selected now
                </Button>

                <Button onClick={clearSelection}>
                  Clear selection
                </Button>
              </InlineStack>
            ) : null}
          </InlineStack>
        </Card>

        <Card padding="0">
          <div style={{ padding: "16px" }}>
            <InlineStack gap="400" blockAlign="end" wrap>
              <div style={{ minWidth: 300, flex: "1 1 320px" }}>
                <TextField
                  label="Search collections"
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    setPage(1);
                  }}
                  placeholder="Search by title or handle"
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setQuery("")}
                />
              </div>

              <div style={{ minWidth: 260 }}>
                <Select
                  label="Filter"
                  options={filterOptions}
                  value={filter}
                  onChange={(value) => {
                    setFilter(value);
                    setPage(1);
                  }}
                />
              </div>

              <div style={{ minWidth: 260 }}>
                <Select
                  label="Sorting strategy"
                  options={ruleOptions}
                  value={rule}
                  onChange={(value) => setRule(value)}
                />
              </div>
            </InlineStack>
          </div>

          <IndexTable
            resourceName={{
              singular: "collection",
              plural: "collections",
            }}
            itemCount={filteredCollections.length}
            selectable={false}
            headings={[
              { title: (
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleSelectVisible}
                  aria-label="Select visible collections"
                  style={{
                    width: 16,
                    height: 16,
                    marginRight: 8,
                  }}
                />
              ) },
              { title: "Sorting" },
              { title: "Collection" },
              { title: "Strategy" },
              { title: "Products" },
              { title: "Last sorted" },
              { title: "Actions", alignment: "end" },
            ]}
          >
            {pagedCollections.map((collection, index) => {
              const enabled = enabledCollectionIds.includes(collection.id);
              const manual = collection.sortOrder === "MANUAL";

              return (
                <IndexTable.Row
                  id={collection.id}
                  key={collection.id}
                  position={index}
                >
                  <IndexTable.Cell>
                    <input
                      type="checkbox"
                      checked={selectedResources.includes(collection.id)}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleSelectedCollection(collection.id);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${collection.title}`}
                      style={{
                        width: 16,
                        height: 16,
                      }}
                    />
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <InlineStack gap="200" blockAlign="center">
                      <button
                        type="button"
                        aria-label={
                          enabled
                            ? "Disable sorting for collection"
                            : "Enable sorting for collection"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCollectionEnabled(collection.id);
                        }}
                        style={{
                          width: 42,
                          height: 24,
                          borderRadius: 999,
                          border: "none",
                          padding: 2,
                          background: enabled ? "#303030" : "#d1d5db",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#fff",
                            transform: enabled
                              ? "translateX(18px)"
                              : "translateX(0)",
                            transition: "transform 140ms ease",
                          }}
                        />
                      </button>

                      <Text as="span" tone={enabled ? undefined : "subdued"}>
                        {enabled ? "Enabled" : "Disabled"}
                      </Text>
                    </InlineStack>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {collection.title}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" tone={enabled ? undefined : "subdued"}>
                      {enabled ? humanRule(rule) : "No strategy enabled"}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <InlineStack gap="100" blockAlign="center">
                      <Text as="span">{collection.productsCount}</Text>
                      {manual ? (
                        <Badge tone="success">Manual</Badge>
                      ) : (
                        <Badge tone="warning">Not manual</Badge>
                      )}
                    </InlineStack>
                  </IndexTable.Cell>

                  <IndexTable.Cell>-</IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ textAlign: "right" }}>
                      <Button
                        size="slim"
                        disabled={!enabled || isApplying}
                        loading={isApplying && enabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          submitCollections("post", "apply_sorting", [
                            collection.id,
                          ]);
                        }}
                      >
                        Sort
                      </Button>
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>

          {filteredCollections.length === 0 ? (
            <div style={{ padding: 24 }}>
              <EmptyState
                heading="No collections match your filters"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Try changing the search or filter.</p>
              </EmptyState>
            </div>
          ) : null}

          <div style={{ padding: "12px 16px", borderTop: "1px solid #ebebeb" }}>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" tone="subdued">
                Showing {pagedCollections.length} of {filteredCollections.length} collections
              </Text>

              <Pagination
                hasPrevious={currentPage > 1}
                onPrevious={() => setPage((value) => Math.max(1, value - 1))}
                hasNext={currentPage < totalPages}
                onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
              />
            </InlineStack>
          </div>
        </Card>
      </BlockStack>
    </Page>
  );
}
