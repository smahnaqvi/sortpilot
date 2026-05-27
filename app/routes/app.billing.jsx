import { useLoaderData, useSubmit, useNavigation } from "react-router";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

const PLANS = {
  free: {
    name: "Free",
    price: 0,
    subtitle: "For beginners",
    limit: 10,
    badge: null,
    features: [
      "10 collections",
      "Manual sorting",
      "Basic sorting rules",
      "Daily sorting limit",
    ],
    unavailable: ["Automation", "Analytics", "Smart collections"],
  },
  scale: {
    name: "Scale",
    price: 4.99,
    subtitle: "For growing stores",
    limit: 50,
    badge: null,
    intro: "Everything in Free, plus",
    features: [
      "50 collections",
      "Scheduled automation",
      "Saved strategies",
      "Bulk sorting",
      "Basic analytics",
      "Hourly sync",
    ],
    unavailable: [],
  },
  velocity: {
    name: "Velocity",
    price: 15.99,
    subtitle: "For serious Shopify brands",
    limit: 100,
    badge: "Most popular",
    intro: "Everything in Scale, plus",
    features: [
      "100 collections",
      "Advanced sorting signals",
      "Automation rules",
      "Smart collections",
      "Analytics dashboard",
      "Inventory-aware sorting",
      "Bestseller boosting",
      "Priority processing",
    ],
    unavailable: [],
  },
  enterprise: {
    name: "Enterprise",
    price: 44.99,
    subtitle: "For large catalogs",
    limit: 500,
    badge: null,
    intro: "Everything in Velocity, plus",
    features: [
      "500 collections",
      "Unlimited automations",
      "Advanced analytics",
      "AI sorting signals",
      "Premium support",
      "Custom scheduling",
      "Multi-location inventory",
      "Early beta access",
    ],
    unavailable: [],
  },
};

function detectPlan(activeSubscriptions) {
  const active = activeSubscriptions?.[0];

  if (!active) return PLANS.free;

  const match = Object.values(PLANS).find(
    (plan) => plan.name.toLowerCase() === active.name.toLowerCase(),
  );

  return match || PLANS.free;
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query CurrentAppSubscription {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const data = await response.json();

  const activeSubscriptions =
    data?.data?.currentAppInstallation?.activeSubscriptions || [];

  return {
    currentPlan: detectPlan(activeSubscriptions),
    activeSubscriptions,
    plans: PLANS,
  };
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const planKey = String(formData.get("plan") || "free");
  const plan = PLANS[planKey];

  if (!plan) {
    return {
      ok: false,
      message: "Invalid plan selected.",
    };
  }

  if (planKey === "free") {
    return {
      ok: true,
      message: "Free plan selected.",
    };
  }

  const url = new URL(request.url);
  const returnUrl = `${url.origin}/app/billing`;

  const response = await admin.graphql(
    `
      mutation CreateSubscription(
        $name: String!
        $returnUrl: URL!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $test: Boolean
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          lineItems: $lineItems
          test: $test
        ) {
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        name: plan.name,
        returnUrl,
        test: false,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.price,
                  currencyCode: "USD",
                },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    },
  );

  const data = await response.json();
  const errors = data?.data?.appSubscriptionCreate?.userErrors || [];

  if (errors.length > 0) {
    return {
      ok: false,
      message: errors.map((error) => error.message).join(", "),
    };
  }

  const confirmationUrl = data?.data?.appSubscriptionCreate?.confirmationUrl;

  if (!confirmationUrl) {
    return {
      ok: false,
      message: "Subscription confirmation URL was not generated.",
    };
  }

  return Response.redirect(confirmationUrl);
}

function FeatureItem({ children, muted = false, negative = false }) {
  return (
    <InlineStack gap="150" blockAlign="start">
      <span
        style={{
          color: negative ? "#bf0711" : muted ? "#8c9196" : "#008060",
          fontWeight: 700,
          width: 16,
        }}
      >
        {negative ? "×" : "✓"}
      </span>

      <Text as="p" tone={muted ? "subdued" : undefined}>
        {children}
      </Text>
    </InlineStack>
  );
}

export default function BillingPage() {
  const { currentPlan, plans, activeSubscriptions } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isLoading = navigation.state === "submitting";

  function choosePlan(planKey) {
    const formData = new FormData();
    formData.set("plan", planKey);
    submit(formData, { method: "post" });
  }

  return (
    <Page
      title="Billing"
      subtitle="Choose the plan that matches your collection volume and automation needs"
      fullWidth
    >
      <BlockStack gap="400">
        <Banner tone="info" title={`You are currently on ${currentPlan.name}`}>
          <p>
            Your current plan supports up to {currentPlan.limit} collections.
            Upgrade when your catalog needs more automation power.
          </p>
        </Banner>

        <InlineStack gap="400" wrap>
          {Object.entries(plans).map(([key, plan]) => {
            const isCurrent = currentPlan.name === plan.name;
            const isRecommended = key === "velocity";

            return (
              <div
                key={key}
                style={{
                  flex: "1 1 240px",
                  minWidth: 240,
                }}
              >
                <Card>
                  
                  <BlockStack gap="350">
                    <div
                        style={{
                            margin: "-16px -16px 16px -16px",
                            padding: "16px",
                            borderRadius: "12px 12px 0 0",
                            background:
                            key === "velocity"
                                ? "#d1fadf"
                                : key === "enterprise"
                                ? "#1f1f1f"
                                : "transparent",
                            color: key === "enterprise" ? "#ffffff" : "inherit",
                        }}>

                    <InlineStack align="space-between" blockAlign="center">
                    
                      <BlockStack gap="050">
                        <Text as="h2" variant="headingLg">
                          {plan.name}
                        </Text>

                        <Text
                        as="p"
                        tone={key === "enterprise" ? undefined : "subdued"}
                        >
                        {plan.subtitle}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        {plan.badge ? (
                          <Badge tone="success">{plan.badge}</Badge>
                        ) : null}

                        {isCurrent ? (
                          <Badge tone="info">Current</Badge>
                        ) : null}
                      </BlockStack>
                    </InlineStack>
                    </div>

                    <InlineStack gap="100" blockAlign="end">
                      <Text as="p" variant="heading2xl">
                        {plan.price === 0 ? "Free" : `$${plan.price}`}
                      </Text>

                      {plan.price > 0 ? (
                        <Text as="p" tone="subdued">
                          /month
                        </Text>
                      ) : null}
                    </InlineStack>

                    <Divider />

                    {plan.intro ? (
                      <Text as="p" fontWeight="semibold">
                        {plan.intro}
                      </Text>
                    ) : null}

                    <BlockStack gap="200">
                      {plan.features.map((feature) => (
                        <FeatureItem key={feature}>{feature}</FeatureItem>
                      ))}

                      {plan.unavailable.map((feature) => (
                        <FeatureItem key={feature} negative muted>
                          {feature}
                        </FeatureItem>
                      ))}
                    </BlockStack>

                    <Button
                      fullWidth
                      variant={isCurrent ? undefined : "primary"}
                      disabled={isCurrent || isLoading}
                      loading={isLoading}
                      onClick={() => choosePlan(key)}
                    >
                      {isCurrent ? "Active plan" : "Choose plan"}
                    </Button>
                  </BlockStack>
                </Card>
              </div>
            );
          })}
        </InlineStack>

        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">
                Need a quote for 500+ sorted collections?
              </Text>

              <Text as="p" tone="subdued">
                Please select the Enterprise plan and then contact us for custom
                catalog volume, advanced automation, or agency support.
              </Text>
            </BlockStack>

            <Button url="mailto:support@sortpilot.ai">
              Contact us
            </Button>
          </InlineStack>
        </Card>

        {activeSubscriptions.length > 0 ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Active Shopify subscription
              </Text>

              {activeSubscriptions.map((subscription) => (
                <InlineStack
                  key={subscription.id}
                  align="space-between"
                  blockAlign="center"
                >
                  <Text as="p">{subscription.name}</Text>
                  <Badge tone="success">{subscription.status}</Badge>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        ) : null}

        <Text as="p" tone="subdued" alignment="center">
          Billing is processed securely through Shopify.
        </Text>
      </BlockStack>
    </Page>
  );
}