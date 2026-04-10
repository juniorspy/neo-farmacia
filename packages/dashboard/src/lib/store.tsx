"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface Store {
  id: string;
  name: string;
}

interface StoreContextType {
  currentStore: Store | null;
  stores: Store[];
  setStores: (stores: Store[]) => void;
  selectStore: (store: Store) => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);

  const selectStore = useCallback((store: Store) => {
    setCurrentStore(store);
    localStorage.setItem("currentStoreId", store.id);
  }, []);

  const handleSetStores = useCallback(
    (newStores: Store[]) => {
      setStores(newStores);
      if (newStores.length > 0 && !currentStore) {
        const savedId = localStorage.getItem("currentStoreId");
        const saved = newStores.find((s) => s.id === savedId);
        setCurrentStore(saved || newStores[0]);
      }
    },
    [currentStore]
  );

  return (
    <StoreContext.Provider
      value={{ currentStore, stores, setStores: handleSetStores, selectStore }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
