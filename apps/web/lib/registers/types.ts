export type RegisterStatus = "active" | "inactive";
export type RegisterSessionStatus = "open" | "closed";

export interface Register {
  id: string;
  businessId: string;
  name: string;
  status: RegisterStatus;
}

export interface RegisterSession {
  id: string;
  businessId: string;
  registerId: string;
  userId: string;
  status: RegisterSessionStatus;
  openingAmount: number | null;
  openedAt: string;
  closedAt: string | null;
}
