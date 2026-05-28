import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  List,
  Badge,
  Divider,
} from "@shopify/polaris";

export default function HelpPage() {
  return (
    <Page
      title="Help & Support"
      subtitle="Guides, common questions, and support resources for SortPilot"
      fullWidth
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Quick Start
              </Text>
              <Badge tone="info">Recommended</Badge>
            </InlineStack>

            <List type="number">
              <List.Item>
                Open the Collections page and review which collections are manual-sort ready.
              </List.Item>
              <List.Item>
                Use the toggle beside a collection to enable or disable SortPilot automation.
              </List.Item>
              <List.Item>
                Choose a sorting rule for each enabled collection. Changes are saved automatically.
              </List.Item>
              <List.Item>
                Use Sort on a row to apply that collection’s assigned rule immediately.
              </List.Item>
              <List.Item>
                Open Strategies to create reusable scheduled rules for one or more collections.
              </List.Item>
            </List>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              How Sorting Works
            </Text>

            <BlockStack gap="250">
              <div>
                <Text as="h3" fontWeight="semibold">
                  Manual sort order is required
                </Text>
                <Text as="p" tone="subdued">
                  Shopify only allows apps to reorder products when a collection uses Manual sort order. If a collection is set to best-selling, newest, or another Shopify sort mode, SortPilot will skip it and show a message.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  Collection toggles are auto-saved
                </Text>
                <Text as="p" tone="subdued">
                  Enabling or disabling a collection saves immediately. You do not need to click a separate save button.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  Strategies are reusable automations
                </Text>
                <Text as="p" tone="subdued">
                  A strategy stores the rule, schedule, and assigned collections. Active scheduled strategies can run again later to keep collection order updated as product data changes.
                </Text>
              </div>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Frequently Asked Questions
            </Text>

            <BlockStack gap="300">
              <div>
                <Text as="h3" fontWeight="semibold">
                  Does SortPilot edit my products?
                </Text>
                <Text as="p" tone="subdued">
                  No. SortPilot only changes product order inside selected collections. Product titles, prices, inventory, descriptions, and images are not edited.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  Why was my collection skipped?
                </Text>
                <Text as="p" tone="subdued">
                  The most common reason is that the collection is not using Manual sort order. Change the collection sort order to Manual in Shopify admin, then run sorting again.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  What is the difference between Collections and Strategies?
                </Text>
                <Text as="p" tone="subdued">
                  Collections is for quick per-collection setup and immediate sorting. Strategies is for saving reusable rules that can run on a schedule across multiple collections.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  Can I sort multiple collections at once?
                </Text>
                <Text as="p" tone="subdued">
                  Yes. Use the checkboxes on the Collections page to select multiple collections, then use bulk actions or create a strategy for scheduled automation.
                </Text>
              </div>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">
                Need additional support?
              </Text>
              <Text as="p" tone="subdued">
                Use the support form on the AHN Tech website for onboarding help, billing questions, or troubleshooting.
              </Text>
            </BlockStack>

            <Button
              onClick={() =>
                window.open("https://ahntech.staticdomains.app/support.html", "_blank", "noopener,noreferrer")
              }
            >
              Contact support
            </Button>
          </InlineStack>
        </Card>

        <Divider />

        <Text as="p" tone="subdued" alignment="center">
          SortPilot is built by AHN Tech for Shopify merchants who want cleaner collection merchandising workflows.
        </Text>
      </BlockStack>
    </Page>
  );
}
