import { create } from "zustand";
import { API } from "@/lib/apiFetch";

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
}));
