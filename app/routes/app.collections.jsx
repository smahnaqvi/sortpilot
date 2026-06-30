import { getPlanFeatures } from "../models/plan-features";
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

function getDiscountPercent(product) {
  const price = Number(product.price || 0);
  const compareAtPrice = Number(product.compareAtPrice || 0);

  if (!compareAtPrice || compareAtPrice <= price || compareAtPrice <= 0) {
    return 0;
  }

  return ((compareAtPrice - price) / compareAtPrice) * 100;
}

function sortProducts(products, rule, pushOutOfStockDown = false) {
  const sorted = [...products];

  sorted.sort((a, b) => {
    const inventoryA = Number(a.totalInventory || 0);
    const inventoryB = Number(b.totalInventory || 0);

    if (pushOutOfStockDown) {
      const aOutOfStock = inventoryA <= 0;
      const bOutOfStock = inventoryB <= 0;

      if (aOutOfStock && !bOutOfStock) return 1;
      if (!aOutOfStock && bOutOfStock) return -1;
    }

    if (rule === "discount_high_low") {
      return getDiscountPercent(b) - getDiscountPercent(a);
    }

    if (rule === "discount_low_high") {
      return getDiscountPercent(a) - getDiscountPercent(b);
    }

    if (rule === "price_high_low") {
      return Number(b.price) - Number(a.price);
    }

    if (rule === "price_low_high") {
      return Number(a.price) - Number(b.price);
    }

    if (rule === "inventory_high_low") {
      return inventoryB - inventoryA;
    }

    if (rule === "inventory_low_high") {
      return inventoryA - inventoryB;
    }

    if (rule === "newest_first") {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }

    if (rule === "oldest_first") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }

    if (rule === "title_az") {
      return a.title.localeCompare(b.title);
    }

    if (rule === "title_za") {
      return b.title.localeCompare(a.title);
    }

    if (rule === "randomize") {
      return Math.random() - 0.5;
    }

    return 0;
  });

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
    discount_high_low: "Sort by discount highest first",
    discount_low_high: "Sort by discount lowest first",
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

async function fetchAllCollections(admin) {
  const collections = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `
        query GetCollections($cursor: String) {
          collections(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
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
      `,
      {
        variables: {
          cursor,
        },
      },
    );

    const data = await response.json();
    const connection = data?.data?.collections;

    const pageCollections =
      connection?.edges?.map((edge) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        sortOrder: edge.node.sortOrder,
        productsCount: edge.node.productsCount?.count || 0,
      })) || [];

    collections.push(...pageCollections);

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor || null;
  }

  return collections;
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
                compareAtPriceRange {
                  minVariantCompareAtPrice {
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
        compareAtPrice:
          product.compareAtPriceRange?.minVariantCompareAtPrice?.amount ||
          product.priceRangeV2?.minVariantPrice?.amount ||
          "0.00",
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

async function reorderCollection(admin, collectionId, rule, pushOutOfStockDown = false) {
  const result = await fetchCollectionWithProducts(admin, collectionId);

  if (!result.collection) {
    return {
      ok: false,
      title: "Unknown collection",
      message: "Collection not found.",
    };
  }

  let changedToManual = false;

  if (result.collection.sortOrder !== "MANUAL") {
    const manualResponse = await admin.graphql(
      `
        mutation CollectionUpdate($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
              sortOrder
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
          input: {
            id: collectionId,
            sortOrder: "MANUAL",
          },
        },
      },
    );

    const manualData = await manualResponse.json();

    if (manualData.errors?.length) {
      return {
        ok: false,
        title: result.collection.title,
        message: manualData.errors.map((error) => error.message).join(", "),
      };
    }

    const manualErrors =
      manualData?.data?.collectionUpdate?.userErrors || [];

    if (manualErrors.length > 0) {
      return {
        ok: false,
        title: result.collection.title,
        message: manualErrors.map((error) => error.message).join(", "),
      };
    }

    changedToManual = true;
  }

  const sortedProducts = sortProducts(result.products, rule, pushOutOfStockDown);
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
    message: changedToManual
      ? `Collection switched to manual sorting. ${moves.length} product move(s) sent to Shopify.`
      : `${moves.length} product move(s) sent to Shopify.`,
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
  
  const collections = await fetchAllCollections(admin);

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
  const currentFeatures = getPlanFeatures(currentPlan.name);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_single_collection_setting") {
    const collectionId = String(formData.get("collectionId") || "");
    const selectedRule = String(formData.get("rule") || "inventory_high_low");
    const isEnabled = String(formData.get("isEnabled") || "false") === "true";

    if (!collectionId) {
      return { ok: false, message: "Collection ID is required.", results: [] };
    }

    const enabledCount = await db.collectionSetting.count({
      where: { shop: session.shop, isEnabled: true },
    });

    const existingSetting = await db.collectionSetting.findUnique({
      where: { shop_collectionId: { shop: session.shop, collectionId } },
    });

    if (isEnabled && !existingSetting?.isEnabled && enabledCount >= currentPlan.limit) {
      return {
        ok: false,
        message: `${currentPlan.name} plan allows up to ${currentPlan.limit} enabled collections.`,
        results: [],
      };
    }

    await db.collectionSetting.upsert({
      where: { shop_collectionId: { shop: session.shop, collectionId } },
      update: { isEnabled, rule: selectedRule },
      create: { shop: session.shop, collectionId, isEnabled, rule: selectedRule },
    });

    return {
      ok: true,
      message: isEnabled ? "Collection automation enabled." : "Collection automation disabled.",
      results: [],
    };
  }

  if (intent === "save_bulk_collection_settings") {
    const collectionIds = formData.getAll("collectionIds");
    const bulkAction = String(formData.get("bulkAction") || "enable");

    if (!currentFeatures.bulkSorting) {
      return {
        ok: false,
        message: "Bulk collection actions are available on the Scale plan and higher.",
        results: [],
      };
    }

    if (!collectionIds.length) {
      return { ok: false, message: "Select at least one collection.", results: [] };
    }

    const existingSettings = await db.collectionSetting.findMany({
      where: { shop: session.shop },
    });

    const existingEnabledIds = existingSettings
      .filter((setting) => setting.isEnabled)
      .map((setting) => setting.collectionId);

    const requestedEnabledIds =
      bulkAction === "enable"
        ? Array.from(new Set([...existingEnabledIds, ...collectionIds]))
        : existingEnabledIds.filter((id) => !collectionIds.includes(id));

    const nextEnabledIds = requestedEnabledIds.slice(0, currentPlan.limit);
    const skippedCount =
      bulkAction === "enable"
        ? Math.max(0, requestedEnabledIds.length - nextEnabledIds.length)
        : 0;

    for (const collectionId of collectionIds) {
      const currentSetting = existingSettings.find(
        (setting) => setting.collectionId === collectionId,
      );

      await db.collectionSetting.upsert({
        where: { shop_collectionId: { shop: session.shop, collectionId } },
        update: {
          isEnabled: nextEnabledIds.includes(collectionId),
          rule: currentSetting?.rule || "inventory_high_low",
        },
        create: {
          shop: session.shop,
          collectionId,
          isEnabled: nextEnabledIds.includes(collectionId),
          rule: "inventory_high_low",
        },
      });
    }

    return {
      ok: true,
      message:
        bulkAction === "enable"
          ? skippedCount > 0
            ? `${nextEnabledIds.length} collection(s) are enabled. ${skippedCount} selected collection(s) were not enabled because your ${currentPlan.name} plan allows ${currentPlan.limit} enabled collections only.`
            : "Selected collections enabled."
          : "Selected collections disabled.",
      results: [],
    };
  }

  if (intent === "save_collection_settings") {
    const enabledIds = formData.getAll("enabledCollectionIds");
    const selectedRule = String(formData.get("rule") || "inventory_high_low");

    for (const collectionId of enabledIds) {
      await db.collectionSetting.upsert({
        where: { shop_collectionId: { shop: session.shop, collectionId } },
        update: { isEnabled: true, rule: selectedRule },
        create: { shop: session.shop, collectionId, isEnabled: true, rule: selectedRule },
      });
    }

    await db.collectionSetting.updateMany({
      where: { shop: session.shop, collectionId: { notIn: enabledIds } },
      data: { isEnabled: false },
    });

    return { ok: true, message: "Collection sorting settings saved.", results: [] };
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
            true,
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
  const pushOutOfStockDown =
    String(formData.get("pushOutOfStockDown") || "false") === "true";

  if (!collectionIds.length || !rule) {
    return {
      ok: false,
      message: "Select at least one collection and sorting rule.",
      results: [],
    };
  }

  if (collectionIds.length > 1 && !currentFeatures.bulkSorting) {
    return {
      ok: false,
      message: "Bulk sorting is available on the Scale plan and higher. Free plan supports single-collection manual sorting.",
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
    const result = await reorderCollection(
      admin,
      collectionId,
      rule,
      pushOutOfStockDown,
    );
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
  const features = getPlanFeatures(plan.name);

  const settingsMap = useMemo(() => {
    const map = {};

    collectionSettings.forEach((setting) => {
      map[setting.collectionId] = setting;
    });

    return map;
  }, [collectionSettings]);

  const enabledFromDb = collectionSettings
    .filter((setting) => setting.isEnabled)
    .map((setting) => setting.collectionId);

  const [enabledCollectionIds, setEnabledCollectionIds] = useState(enabledFromDb);
  const [quickRule, setQuickRule] = useState(selectedRule);
  const [pushOutOfStockDown, setPushOutOfStockDown] = useState(true);
  const [limitWarning, setLimitWarning] = useState("");
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
    { label: "Discount: High to Low", value: "discount_high_low" },
    { label: "Discount: Low to High", value: "discount_low_high" },
    { label: "Newest Products First", value: "newest_first" },
    { label: "Oldest Products First", value: "oldest_first" },
    { label: "Title: A to Z", value: "title_az" },
    { label: "Title: Z to A", value: "title_za" },
    { label: "Randomize Products", value: "randomize" },
  ];

  const filterOptions = [
    { label: "All collections", value: "all" },
    { label: "Manual only", value: "manual" },
    { label: "Auto sorted", value: "not_manual" },
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

  function saveSingleCollectionSetting(collectionId, isEnabled, selectedRule) {
    const formData = new FormData();

    formData.set("intent", "save_single_collection_setting");
    formData.set("collectionId", collectionId);
    formData.set("isEnabled", String(isEnabled));
    formData.set("rule", selectedRule);

    submit(formData, { method: "post" });
  }

  function showPlanLimitWarning(extraMessage = "") {
    const message = `Your ${plan.name} plan allows ${plan.collectionLimit} enabled collections only.${extraMessage ? ` ${extraMessage}` : ""}`;

    setLimitWarning(message);
    window.alert(message);
  }

  function toggleCollectionEnabled(id) {
    const currentlyEnabled = enabledCollectionIds.includes(id);
    const nextEnabled = !currentlyEnabled;

    if (nextEnabled && enabledCollectionIds.length >= plan.collectionLimit) {
      showPlanLimitWarning("Please disable another collection or upgrade your plan.");
      return;
    }

    setLimitWarning("");

    setEnabledCollectionIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      return [...current, id];
    });

    saveSingleCollectionSetting(
      id,
      nextEnabled,
      settingsMap[id]?.rule || "inventory_high_low",
    );
  }

  function updateCollectionRule(collectionId, nextRule) {
    saveSingleCollectionSetting(
      collectionId,
      enabledCollectionIds.includes(collectionId),
      nextRule,
    );
  }

  function saveBulkCollectionSettings(bulkAction) {
    const formData = new FormData();

    selectedResources.forEach((id) => {
      formData.append("collectionIds", id);
    });

    formData.set("intent", "save_bulk_collection_settings");
    formData.set("bulkAction", bulkAction);

    submit(formData, { method: "post" });
  }

  function enableSelectedCollections() {
    const newSelectedIds = selectedResources.filter(
      (id) => !enabledCollectionIds.includes(id),
    );

    const remainingSlots = Math.max(
      0,
      plan.collectionLimit - enabledCollectionIds.length,
    );

    if (newSelectedIds.length > remainingSlots) {
      showPlanLimitWarning(
        `You selected ${newSelectedIds.length} new collection(s), but only ${remainingSlots} slot(s) are available.`,
      );
    } else {
      setLimitWarning("");
    }

    setEnabledCollectionIds((current) => {
      const nextIds = Array.from(new Set([...current, ...selectedResources]));
      return nextIds.slice(0, plan.collectionLimit);
    });

    saveBulkCollectionSettings("enable");
  }

  function disableSelectedCollections() {
    setEnabledCollectionIds((current) =>
      current.filter((id) => !selectedResources.includes(id)),
    );

    saveBulkCollectionSettings("disable");
  }

  function submitCollections(method, intent = "apply_sorting", specificIds = null) {
    const formData = new FormData();
    const targetIds = specificIds || selectedResources;

    targetIds.forEach((id) => {
      formData.append("collectionIds", id);
    });

    const collectionRule =
      specificIds?.length === 1
        ? settingsMap[specificIds[0]]?.rule || "inventory_high_low"
        : quickRule;

    formData.set("rule", collectionRule);
    formData.set("pushOutOfStockDown", String(pushOutOfStockDown));
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
            title="Sorting update"
          >
            <p>{actionData.message}</p>
          </Banner>
        ) : null}

        {limitWarning ? (
          <Banner tone="warning" title="Collection limit reached">
            <p>{limitWarning}</p>
          </Banner>
        ) : null}

        {!features.bulkSorting ? (
          <Banner tone="info" title="Free plan includes manual single-collection sorting">
            <p>Upgrade to Scale or higher to unlock bulk actions, saved strategies, scheduled automation, and analytics.</p>
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
                <Button disabled={!features.bulkSorting} onClick={enableSelectedCollections}>
                  Enable sorting
                </Button>

                <Button disabled={!features.bulkSorting} onClick={disableSelectedCollections}>
                  Disable sorting
                </Button>

                <Button
                  variant="primary"
                  loading={isApplying}
                  disabled={!features.bulkSorting}
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
                  label="Quick sort strategy"
                  options={ruleOptions}
                  value={quickRule}
                  onChange={(value) => setQuickRule(value)}
                />
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 36,
                  paddingBottom: 2,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={pushOutOfStockDown}
                  onChange={(event) =>
                    setPushOutOfStockDown(event.target.checked)
                  }
                />
                Push out of stock items down
              </label>
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
                    {enabled ? (
                      <Select
                        label=""
                        labelHidden
                        options={ruleOptions}
                        value={settingsMap[collection.id]?.rule || "inventory_high_low"}
                        onChange={(value) => updateCollectionRule(collection.id, value)}
                      />
                    ) : (
                      <Text as="span" tone="subdued">
                        No strategy enabled
                      </Text>
                    )}
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <InlineStack gap="100" blockAlign="center">
                      <Text as="span">{collection.productsCount}</Text>
                      {manual ? (
                        <Badge tone="success">Manual</Badge>
                      ) : (
                        <Badge tone="info">Auto</Badge>
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
