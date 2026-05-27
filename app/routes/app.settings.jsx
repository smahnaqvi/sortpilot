import { useState } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Select,
  Button,
  Banner,
} from "@shopify/polaris";

const timezoneOptions =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone").map((timezone) => ({
        label: timezone,
        value: timezone,
      }))
    : [
        { label: "UTC", value: "UTC" },
        { label: "Asia/Karachi", value: "Asia/Karachi" },
        { label: "America/New_York", value: "America/New_York" },
        { label: "Europe/London", value: "Europe/London" },
      ];

const sortingOptions = [
  {
    label: "Inventory: High to Low",
    value: "inventory_high_low",
  },
  {
    label: "Inventory: Low to High",
    value: "inventory_low_high",
  },
  {
    label: "Price: High to Low",
    value: "price_high_low",
  },
  {
    label: "Price: Low to High",
    value: "price_low_high",
  },
  {
    label: "Newest Products First",
    value: "newest_first",
  },
  {
    label: "Oldest Products First",
    value: "oldest_first",
  },
  {
    label: "Title: A to Z",
    value: "title_az",
  },
  {
    label: "Title: Z to A",
    value: "title_za",
  },
];

export default function SettingsPage() {
  const [frequency, setFrequency] = useState("daily");
  const [strategy, setStrategy] = useState("inventory_high_low");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [saved, setSaved] = useState(false);

  function saveSettings() {
    setSaved(true);
  }

  return (
    <Page
      title="Settings"
      subtitle="Configure global app preferences"
      fullWidth
    >
      <BlockStack gap="400">
        {saved ? (
          <Banner tone="success" title="Settings saved">
            <p>Your preferences have been saved for this session.</p>
          </Banner>
        ) : null}

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
              value={frequency}
              onChange={(value) => {
                setFrequency(value);
                setSaved(false);
              }}
            />

            <Select
              label="Default sorting strategy"
              options={sortingOptions}
              value={strategy}
              onChange={(value) => {
                setStrategy(value);
                setSaved(false);
              }}
            />

            <Select
              label="Store timezone"
              options={timezoneOptions}
              value={timezone}
              onChange={(value) => {
                setTimezone(value);
                setSaved(false);
              }}
            />

            <InlineStack align="end">
              <Button variant="primary" onClick={saveSettings}>
                Save settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                App Status
              </Text>

              <Badge tone="success">Operational</Badge>
            </InlineStack>

            <Text as="p" tone="subdued">
              Collection sorting automation is running normally.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Support
              </Text>

              <Text as="p" tone="subdued">
                For help, open the AHN Tech support page in a new browser tab.
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
              Open support
            </Button>
          </InlineStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
