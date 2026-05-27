import {
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";

import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
}

export default function AppLayout() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href="/app/collections" rel="home">Collections</a>
        <a href="/app/strategies">Strategies</a>
        <a href="/app/analytics">Analytics</a>
        <a href="/app/settings">Settings</a>
        <a href="/app/billing">Billing</a>
        <a href="/app/help">Help</a>
      </NavMenu>

      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};