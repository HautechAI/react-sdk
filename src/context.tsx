import { createSDK, SDK } from '@hautechai/sdk';
import { createContext, PropsWithChildren, useContext, useMemo } from 'react';

const SDKContext = createContext<SDK | null>(null);

export const SDKProvider = (props: PropsWithChildren<{ token: string }>) => {
    const sdk = useMemo(() => createSDK({ authToken: () => props.token }), [props.token]);
    return <SDKContext.Provider value={sdk}>{props.children}</SDKContext.Provider>;
};

export const useSDK = () => {
    const sdk = useContext(SDKContext);
    if (!sdk) {
        throw new Error('SDK not found');
    }
    return sdk;
};
