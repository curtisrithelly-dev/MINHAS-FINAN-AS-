export interface Transaction {
  id: string;
  amount: number;
  date: string;
  category: string;
  type: 'income' | 'expense';
  description: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
}

export interface Debt {
  id: string;
  creditor: string;
  totalAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'on_hold';
  notes?: string;
  category?: string;
  type?: 'fixed' | 'unique' | 'installments';
  cardId?: string; // Link to a card if this is a card invoice
  installmentInfo?: {
    current: number;
    total: number;
    groupId: string;
  };
  recurringGroupId?: string;
  isCancelled?: boolean;
  payments?: DebtPayment[];
}

export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  availableLimit: number;
  closingDay: number;
  dueDay: number;
  color?: string;
}
