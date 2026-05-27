import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Select,
  TextField,
  Button,
} from "@shopify/polaris";

export default function SettingsPage() {
  return (
    <Page
      title="Settings"
      subtitle="Configure global app preferences"
      fullWidth
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Automation Settings
            </Text>

            <Select
              label="Default scheduling frequency"
              options={[
                { label: "Manual", value: "manual" },
                { label: "Daily", value: "daily" },
                { label: "Hourly", value: "hourly" },
              ]}
              value="daily"
            />

            <Select
              label="Default sorting strategy"
              options={[
                {
                  label: "Inventory: High to Low",
                  value: "inventory_high_low",
                },
                {
                  label: "Price: High to Low",
                  value: "price_high_low",
                },
              ]}
              value="inventory_high_low"
            />

            <InlineStack align="end">
              <Button variant="primary">
                Save settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                App Status
              </Text>

              <Badge tone="success">
                Operational
              </Badge>
            </InlineStack>

            <Text as="p" tone="subdued">
              Collection sorting automation is running normally.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Store Information
            </Text>

            <TextField
              label="Support email"
              value="support@sortpilot.ai"
              autoComplete="off"
            />

            <TextField
              label="Timezone"
              value="UTC"
              autoComplete="off"
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}