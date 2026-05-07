import { create } from "zustand";

const API = "https://waheed-system-production.up.railway.app";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  category: string;
  available: boolean;
  description?: string;
};

export type OrderItem = { name: string; quantity: number; notes?: string };

export type Order = {
  id: number;
  table_number: number;
  total_price: number;
  status: string;
  created_at: string;
  items?: OrderItem[];
};

type Store = {
  menu: MenuItem[];
  orders: Order[];
  menuLoading: boolean;
  ordersLoading: boolean;
  fetchMenu: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  setMenuItemAvailability: (id: number, available: boolean) => void;
  removeMenuItem: (id: number) => void;
};

export const useStore = create<Store>((set) => ({
  menu: [],
  orders: [],
  menuLoading: false,
  ordersLoading: false,

  fetchMenu: async () => {
    set({ menuLoading: true });
    try {
      const r = await fetch(`${API}/menu`);
      const d = await r.json();
      /* normalize is_available → available (Railway API uses is_available) */
      const menu = (d.menu || []).map((i: MenuItem & { is_available?: boolean }) => ({
        ...i,
        available: i.available ?? i.is_available ?? true,
      }));
      set({ menu });
    } finally {
      set({ menuLoading: false });
    }
  },

  fetchOrders: async () => {
    set({ ordersLoading: true });
    try {
      const r = await fetch(`${API}/orders`);
      const d = await r.json();
      set({ orders: d.orders || [] });
    } finally {
      set({ ordersLoading: false });
    }
  },

  setMenuItemAvailability: (id, available) =>
    set((s) => ({ menu: s.menu.map((m) => (m.id === id ? { ...m, available } : m)) })),

  removeMenuItem: (id) =>
    set((s) => ({ menu: s.menu.filter((m) => m.id !== id) })),
}));
