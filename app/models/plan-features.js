export const PLAN_FEATURES = {
    Free: {
        collections: 10,
        automation: false,
        analytics: false,
        smartCollections: false,
        savedStrategies: false,
        bulkSorting: false,
    },

    Scale: {
        collections: 50,
        automation: true,
        analytics: true,
        smartCollections: false,
        savedStrategies: true,
        bulkSorting: true,
    },

    Velocity: {
        collections: 100,
        automation: true,
        analytics: true,
        smartCollections: true,
        savedStrategies: true,
        bulkSorting: true,
    },

    Enterprise: {
        collections: 500,
        automation: true,
        analytics: true,
        smartCollections: true,
        savedStrategies: true,
        bulkSorting: true,
    },
};

export function getPlanFeatures(planName) {
    return PLAN_FEATURES[planName] ?? PLAN_FEATURES.Free;
}