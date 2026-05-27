import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  List,
} from "@shopify/polaris";

export default function HelpPage() {
  return (
    <Page
      title="Help & Support"
      subtitle="Everything you need to get started with SortPilot"
      fullWidth
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Quick Start
            </Text>

            <List type="number">
              <List.Item>
                Select collections from the Collections page
              </List.Item>

              <List.Item>
                Choose a sorting strategy
              </List.Item>

              <List.Item>
                Enable automation if needed
              </List.Item>

              <List.Item>
                Click Sort to apply changes to Shopify
              </List.Item>
            </List>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Common Questions
            </Text>

            <BlockStack gap="200">
              <div>
                <Text as="h3" fontWeight="semibold">
                  Why is sorting skipped?
                </Text>

                <Text as="p" tone="subdued">
                  Shopify collections must use Manual sort order before
                  SortPilot can reorder products.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  How often do automations run?
                </Text>

                <Text as="p" tone="subdued">
                  Depending on your plan, automations can run hourly or daily.
                </Text>
              </div>

              <div>
                <Text as="h3" fontWeight="semibold">
                  Does SortPilot modify products?
                </Text>

                <Text as="p" tone="subdued">
                  No. SortPilot only changes collection product order.
                </Text>
              </div>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">
                Need additional support?
              </Text>

              <Text as="p" tone="subdued">
                Contact our support team for onboarding or troubleshooting help.
              </Text>
            </BlockStack>

            <Button url="mailto:support@sortpilot.ai">
              Contact support
            </Button>
          </InlineStack>
        </Card>
      </BlockStack>
    </Page>
  );
}