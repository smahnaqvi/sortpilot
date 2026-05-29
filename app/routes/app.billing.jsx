import {
  Form,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useEffect } from "react";
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
    subtitle: "For serious brands",
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
  const { billing, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const planKey = String(formData.get("plan") || "free");
  const plan = PLANS[planKey];

  if (!plan || planKey === "free") {
    return null;
  }

  return billing.request({
    plan: plan.name,
    isTest: false,
    returnUrl: `https://admin.shopify.com/store/${session.shop.replace(
      ".myshopify.com",
      "",
    )}/apps/${process.env.SHOPIFY_API_KEY}/billing`,
  });
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
  const navigation = useNavigation();

  const isLoading = navigation.state === "submitting";

  
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
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="h2" variant="headingLg">
                            {plan.name}
                          </Text>

                          <Text
                            as="p"
                            tone={
                              key === "enterprise" ? undefined : "subdued"
                            }
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

                    <Form method="post" reloadDocument>
                      <input type="hidden" name="plan" value={key} />
                      <Button
                        fullWidth
                        submit
                        variant={isCurrent ? undefined : "primary"}
                        disabled={isCurrent || isLoading}
                        loading={isLoading}
                      >
                        {isCurrent ? "Active plan" : "Choose plan"}
                      </Button>
                    </Form>
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

            <Button
              onClick={() =>
                window.open(
                  "https://ahntech.staticdomains.app/support.html",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
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
