export interface Transaction {
  id: string;
  amount: number;
  date: string;
  category: string;
  type: 'income' | 'expense';
  description: string;
  isWorkExpense?: boolean;
  cardId?: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
  interest?: number;
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
  isWorkExpense?: boolean;
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
  fixedInvoiceAmount?: number; // Se definido, a fatura é gerada automaticamente todo mês com esse valor
}
