export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export const PROJECT_CATEGORIES = [
  "Construction",
  "Interior Design",
  "Renovation",
  "Electrical",
  "Plumbing",
  "Landscaping",
  "Civil",
  "IT / Software",
  "Consulting",
  "Other",
];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_progress: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  on_hold: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export interface Project {
  projectId: string;
  // Basic Info
  projectName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  description: string;
  category: string;
  location: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  // Financial Info
  totalBudget: number;
  estimatedCost: number;
  actualCost: number;
  expectedRevenue: number;
  receivedRevenue: number;
  advancePayments: number;
  pendingPayments: number;
  createdAt: number;
  createdBy: string;
}

// Derived computed values (not stored)
export function computeProjectFinancials(p: Project) {
  const remainingRevenue = p.expectedRevenue - p.receivedRevenue;
  const profitMargin =
    p.expectedRevenue > 0
      ? ((p.expectedRevenue - p.estimatedCost) / p.expectedRevenue) * 100
      : 0;
  const totalCashIn = p.receivedRevenue + p.advancePayments;
  const totalCashOut = p.actualCost;
  const netProfit = totalCashIn - totalCashOut;
  return { remainingRevenue, profitMargin, totalCashIn, totalCashOut, netProfit };
}

export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "cheque";
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
};

export interface IncomeRecord {
  incomeId: string;
  projectId: string;
  projectName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  category: string;
  description: string;
  invoiceUrl?: string;
  createdAt: number;
  createdBy: string;
}

export type ExpenseType =
  | "material"
  | "labour"
  | "transport"
  | "equipment"
  | "maintenance"
  | "miscellaneous";

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  material: "Material",
  labour: "Labour",
  transport: "Transport",
  equipment: "Equipment",
  maintenance: "Maintenance",
  miscellaneous: "Miscellaneous",
};

export const EXPENSE_TYPE_COLORS: Record<ExpenseType, string> = {
  material: "bg-blue-500/15 text-blue-600",
  labour: "bg-purple-500/15 text-purple-600",
  transport: "bg-amber-500/15 text-amber-600",
  equipment: "bg-orange-500/15 text-orange-600",
  maintenance: "bg-red-500/15 text-red-600",
  miscellaneous: "bg-gray-500/15 text-gray-600",
};

export interface ExpenseRecord {
  expenseId: string;
  projectId: string;
  projectName: string;
  amount: number;
  expenseType: ExpenseType;
  vendorName: string;
  date: string;
  description: string;
  billUrl?: string;
  createdAt: number;
  createdBy: string;
}

export type DocCategory =
  | "contract"
  | "quotation"
  | "bill"
  | "invoice"
  | "image"
  | "other";

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  contract: "Contract",
  quotation: "Quotation",
  bill: "Bill",
  invoice: "Invoice",
  image: "Image",
  other: "Other",
};

export interface ProjectDocument {
  docId: string;
  projectId: string;
  projectName: string;
  name: string;
  category: DocCategory;
  url: string;
  fileType: string;
  fileSize: number;
  uploadedAt: number;
  uploadedBy: string;
  uploadedByName?: string;
}

export type NotifType =
  | "budget_exceeded"
  | "payment_received"
  | "expense_added"
  | "project_completed"
  | "task_overdue"
  | "general";

export const NOTIF_ICONS: Record<NotifType, string> = {
  budget_exceeded: "⚠️",
  payment_received: "💰",
  expense_added: "🧾",
  project_completed: "✅",
  task_overdue: "⏰",
  general: "🔔",
};

export interface AppNotification {
  notifId: string;
  type: NotifType;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  projectId?: string;
}

// Helpers
export function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtCompact(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n}`;
}
