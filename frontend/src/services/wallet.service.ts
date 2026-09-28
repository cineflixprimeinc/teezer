import { api } from "./api";

export const walletService = {
  show: async () => (await api.get("/wallet")).data.data,
  transactions: async () => (await api.get("/wallet/transactions")).data.data,
};
