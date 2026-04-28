export interface Transaction {
  id: string;
  amount: number;
  date: string;
  category: string;
  type: 'income' | 'expense';
  description: string;
  bankAccountId?: string; // Link to the account that funded/received the transaction
}

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
  color?: string;
}

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
  bankAccountId: string;
  bankAccountName: string;
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
  closingDay: number;
  dueDay: number;
  color?: string;
}
