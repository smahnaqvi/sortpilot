export const PLANS = {
  Free: { name: "Free", limit: 10 },
  Scale: { name: "Scale", limit: 50 },
  Velocity: { name: "Velocity", limit: 100 },
  Enterprise: { name: "Enterprise", limit: 500 },
};

export async function getCurrentPlan(admin) {
  const response = await admin.graphql(`
    query CurrentAppSubscription {
      currentAppInstallation {
        activeSubscriptions {
          name
          status
        }
      }
    }
  `);

  const data = await response.json();
  const active = data?.data?.currentAppInstallation?.activeSubscriptions?.[0];

  if (!active) return PLANS.Free;

  return PLANS[active.name] || PLANS.Free;
}