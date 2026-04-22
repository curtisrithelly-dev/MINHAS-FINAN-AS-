import { useState, useEffect, useMemo } from 'react';
import { PlusCircle, Wallet, ArrowUpCircle, ArrowDownCircle, CreditCard as CreditCardIcon, History, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Debt, CreditCard, BankAccount } from './types';

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [debts, setDebts] = useState<Debt[]>(() => {
    const saved = localStorage.getItem('debts');
    let debtsData: Debt[] = saved ? JSON.parse(saved) : [];
    
    // Migration: Update existing debt creditor names to match new card names
    debtsData = debtsData.map(debt => {
      if (debt.creditor.includes('Cartão 1600')) {
        return { ...debt, creditor: debt.creditor.replace('Cartão 1600', 'Sicoob') };
      }
      if (debt.creditor.includes('Cartão 500')) {
        return { ...debt, creditor: debt.creditor.replace('Cartão 500', 'Mercado Pago') };
      }
      if (debt.creditor.includes('Cartão 200')) {
        return { ...debt, creditor: debt.creditor.replace('Cartão 200', 'Nubank') };
      }
      return debt;
    });
    
    return debtsData;
  });

  const [cards, setCards] = useState<CreditCard[]>(() => {
    const saved = localStorage.getItem('cards');
    let cardsData: CreditCard[];
    
    if (saved) {
      cardsData = JSON.parse(saved);
      // Migration: Update existing cards to new names/colors if they match old types
      cardsData = cardsData.map(card => {
        if (card.name === 'Cartão 1600' || card.name === 'Sicoob') {
          return { ...card, name: 'Sicoob', closingDay: 1, dueDay: 11, color: '#16A34A' };
        }
        if (card.name === 'Cartão 500' || card.name === 'Mercado Pago') {
          return { ...card, name: 'Mercado Pago', closingDay: 5, dueDay: 10, color: '#2563EB' };
        }
        if (card.name === 'Cartão 200' || card.name === 'Nubank') {
          return { ...card, name: 'Nubank', closingDay: 12, dueDay: 20, color: '#9333EA' };
        }
        return card;
      });
      return cardsData;
    }

    // Default requested cards
    return [
      { id: 'cc-1', name: 'Sicoob', limit: 1600, closingDay: 1, dueDay: 11, color: '#16A34A' },
      { id: 'cc-2', name: 'Mercado Pago', limit: 500, closingDay: 5, dueDay: 10, color: '#2563EB' },
      { id: 'cc-3', name: 'Nubank', limit: 200, closingDay: 12, dueDay: 20, color: '#9333EA' }
    ];
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    const saved = localStorage.getItem('bankAccounts');
    let accounts: BankAccount[];
    
    if (saved) {
      accounts = JSON.parse(saved);
      // Ensure Nubank exists if not already there
      if (!accounts.find(a => a.name === 'Nubank')) {
        accounts.push({ id: 'ba-3', name: 'Nubank', balance: 0, color: '#9333EA' });
      }
      return accounts;
    }

    return [
      { id: 'ba-1', name: 'Mercado Pago', balance: 3400.65, color: '#2563EB' },
      { id: 'ba-2', name: 'Sicoob', balance: 112.00, color: '#16A34A' },
      { id: 'ba-3', name: 'Nubank', balance: 0, color: '#9333EA' }
    ];
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'debts' | 'cards' | 'accounts'>('dashboard');
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isAddingIncome, setIsAddingIncome] = useState(false);
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showCardManager, setShowCardManager] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('debts', JSON.stringify(debts));
  }, [debts]);

  useEffect(() => {
    localStorage.setItem('cards', JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    localStorage.setItem('bankAccounts', JSON.stringify(bankAccounts));
  }, [bankAccounts]);

  // Calculations
  const metrics = useMemo(() => {
    const totalBankBalance = bankAccounts.reduce((acc, ba) => acc + ba.balance, 0);
    const totalDebt = debts.reduce((acc, d) => acc + d.remainingAmount, 0);
    return { balance: totalBankBalance, totalDebt };
  }, [bankAccounts, debts]);

  // Handlers
  const addTransaction = (t: Omit<Transaction, 'id'>, cardId?: string, bankAccountId?: string) => {
    // 1. Limit validation for Credit Cards
    if (cardId && t.type === 'expense') {
      const card = cards.find(c => c.id === cardId);
      if (card) {
        const cardDebts = debts.filter(d => d.creditor.includes(card.name) && d.status !== 'paid');
        const invoiceTotal = cardDebts.reduce((acc, d) => acc + d.remainingAmount, 0);
        const available = card.limit - invoiceTotal;
        
        if (t.amount > available) {
          alert(`Limite insuficiente no cartão ${card.name}! Disponível: ${formatCurrency(available)}`);
          return;
        }
      }
    }

    // 2. Balance updates for Bank Accounts (Debit/Pix/Income)
    if (bankAccountId) {
      const account = bankAccounts.find(ba => ba.id === bankAccountId);
      if (account) {
        if (t.type === 'expense' && account.balance < t.amount) {
          alert(`Saldo insuficiente na conta ${account.name}!`);
          return;
        }
        
        setBankAccounts(prev => prev.map(ba => {
          if (ba.id === bankAccountId) {
            return {
              ...ba,
              balance: t.type === 'income' ? ba.balance + t.amount : ba.balance - t.amount
            };
          }
          return ba;
        }));
      }
    }

    // 3. Register transaction
    const newTransaction: Transaction = { ...t, id: crypto.randomUUID(), bankAccountId };
    setTransactions([newTransaction, ...transactions]);
    
    // 4. Handle Credit Card specific logic (Smart Invoice)
    if (cardId && t.type === 'expense') {
      handleCardInvoiceAutoDebt(t.amount, t.date, cardId);
    }
    
    setIsAddingTransaction(false);
  };

  const transferFunds = (fromId: string, toId: string, amount: number) => {
    const fromAccount = bankAccounts.find(ba => ba.id === fromId);
    if (!fromAccount || fromAccount.balance < amount) {
      alert('Saldo insuficiente para transferência!');
      return;
    }

    setBankAccounts(prev => prev.map(ba => {
      if (ba.id === fromId) return { ...ba, balance: ba.balance - amount };
      if (ba.id === toId) return { ...ba, balance: ba.balance + amount };
      return ba;
    }));

    // Log the transfer as two related transactions (internal bookkeeping)
    const date = new Date().toISOString().split('T')[0];
    addTransaction({
      description: `Transferência enviada para ${bankAccounts.find(b => b.id === toId)?.name}`,
      amount,
      type: 'expense',
      category: 'Transferência',
      date
    }, undefined, fromId);

    addTransaction({
      description: `Transferência recebida de ${fromAccount.name}`,
      amount,
      type: 'income',
      category: 'Transferência',
      date
    }, undefined, toId);

    setIsTransferring(false);
  };

  const handleCardInvoiceAutoDebt = (amount: number, dateString: string, cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const purchaseDate = new Date(dateString);
    const purchaseDay = purchaseDate.getDate();
    
    let targetDate = new Date(purchaseDate);
    // If after closing day, move to next month
    if (purchaseDay > card.closingDay) {
      targetDate.setMonth(targetDate.getMonth() + 1);
    }
    
    // Set to the configured due day
    targetDate.setDate(card.dueDay);
    
    const monthYearLabel = targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const creditorName = `Fatura: ${card.name} (${monthYearLabel})`;
    const dueDateString = targetDate.toISOString().split('T')[0];

    const existingDebt = debts.find(d => d.creditor === creditorName && d.status !== 'paid');

    if (existingDebt) {
      setDebts(debts.map(d => d.id === existingDebt.id ? {
        ...d,
        totalAmount: d.totalAmount + amount,
        remainingAmount: d.remainingAmount + amount
      } : d));
    } else {
      const newDebt: Debt = {
        id: crypto.randomUUID(),
        creditor: creditorName,
        totalAmount: amount,
        remainingAmount: amount,
        dueDate: dueDateString,
        status: 'pending'
      };
      setDebts([newDebt, ...debts]);
    }
  };

  const addDebt = (d: Omit<Debt, 'id' | 'remainingAmount' | 'status' | 'payments'>, installments: number = 1) => {
    if (d.type === 'installments' && installments > 1) {
      const groupId = crypto.randomUUID();
      const newDebts: Debt[] = [];
      const installmentAmount = Number((d.totalAmount / installments).toFixed(2));
      
      for (let i = 1; i <= installments; i++) {
        const dueDate = new Date(d.dueDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        
        newDebts.push({
          ...d,
          id: crypto.randomUUID(),
          totalAmount: installmentAmount,
          remainingAmount: installmentAmount,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending',
          payments: [],
          installmentInfo: {
            current: i,
            total: installments,
            groupId
          }
        });
      }
      setDebts([...newDebts, ...debts]);
    } else if (d.type === 'fixed') {
      const recurringGroupId = crypto.randomUUID();
      const newDebts: Debt[] = [];
      
      // Generate for next 12 months as "recurrent"
      for (let i = 0; i < 12; i++) {
        const dueDate = new Date(d.dueDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        
        newDebts.push({
          ...d,
          id: crypto.randomUUID(),
          remainingAmount: d.totalAmount,
          status: 'pending',
          payments: [],
          recurringGroupId
        });
      }
      setDebts([...newDebts, ...debts]);
    } else {
      const newDebt: Debt = {
        ...d,
        id: crypto.randomUUID(),
        remainingAmount: d.totalAmount,
        status: 'pending',
        payments: []
      };
      setDebts([newDebt, ...debts]);
    }
    setIsAddingDebt(false);
  };

  const registerPayment = (debtId: string, amount: number, bankAccountId?: string) => {
    if (!bankAccountId) {
      alert('Selecione uma conta para realizar o pagamento.');
      return;
    }

    const debt = debts.find((d) => d.id === debtId);
    if (!debt) return;

    const account = bankAccounts.find(ba => ba.id === bankAccountId);
    if (!account || account.balance < amount) {
      alert('Saldo insuficiente na conta selecionada!');
      return;
    }

    const paymentAmount = Math.min(amount, debt.remainingAmount);
    
    // Create payment record
    const newPayment: DebtPayment = {
      id: crypto.randomUUID(),
      amount: paymentAmount,
      date: new Date().toISOString().split('T')[0],
      bankAccountId,
      bankAccountName: account.name
    };

    // Update debt
    setDebts(
      debts.map((d) => {
        if (d.id === debtId) {
          const remaining = Number((d.remainingAmount - paymentAmount).toFixed(2));
          return {
            ...d,
            remainingAmount: remaining,
            status: remaining <= 0 ? 'paid' : d.status,
            payments: [...(d.payments || []), newPayment]
          };
        }
        return d;
      })
    );

    // Register transaction and reduce bank balance
    addTransaction({
      amount: paymentAmount,
      type: 'expense',
      category: 'Dívida',
      date: new Date().toISOString().split('T')[0],
      description: `Pagamento: ${debt.creditor} ${debt.installmentInfo ? `(${debt.installmentInfo.current}/${debt.installmentInfo.total})` : ''}`,
    }, undefined, bankAccountId);
  };

  const deleteDebt = (id: string, cascade: boolean = false) => {
    const target = debts.find(d => d.id === id);
    if (!target) return;

    if (cascade && (target.installmentInfo || target.recurringGroupId)) {
      const gid = target.installmentInfo?.groupId || target.recurringGroupId;
      const targetDate = new Date(target.dueDate);
      setDebts(prev => prev.filter(d => {
        const dGid = d.installmentInfo?.groupId || d.recurringGroupId;
        if (dGid !== gid) return true;
        return new Date(d.dueDate) < targetDate;
      }));
    } else {
      setDebts(prev => prev.filter(d => d.id !== id));
    }
  };

  const deleteSeries = (groupId: string) => {
    if (window.confirm('Tem certeza que deseja apagar toda a série de parcelas?')) {
      setDebts(prev => prev.filter(d => (d.installmentInfo?.groupId !== groupId && d.recurringGroupId !== groupId)));
    }
  };

  const updateDebtSmart = (id: string, updates: Partial<Debt>, applyToFuture: boolean = false) => {
    const target = debts.find(d => d.id === id);
    if (!target) return;

    if (applyToFuture && (target.installmentInfo || target.recurringGroupId)) {
      const gid = target.installmentInfo?.groupId || target.recurringGroupId;
      const targetDate = new Date(target.dueDate);
      setDebts(prev => prev.map(d => {
        const dGid = d.installmentInfo?.groupId || d.recurringGroupId;
        if (dGid === gid && new Date(d.dueDate) >= targetDate) {
          // Calculate new due date for future items based on original offset if needed, 
          // but usually updateDebt is for creditor/amount.
          // If updating dueDate, it's more complex. We'll stick to amount/creditor for now.
          const newObj = { ...d, ...updates };
          if (updates.dueDate) {
            // Adjust relative date? User said "alterar o valor de uma única parcela manualmente sem que o app recalcule as outras sozinho"
            // Wait, "Liberação de Campos: Destrave os campos... Eu preciso conseguir alterar o valor de uma única parcela manualmente sem que o app recalcule as outras sozinho."
            // This means by DEFAULT it's only the current one.
          }
          return newObj;
        }
        return d;
      }));
    } else {
      setDebts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  };

  const deleteTransaction = (id: string) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const updateTransaction = (id: string, updates: Partial<Transaction>) => {
    setTransactions(transactions.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const updateDebt = (id: string, updates: Partial<Debt>) => {
    setDebts(debts.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const updateBankAccount = (id: string, updates: Partial<BankAccount>) => {
    setBankAccounts(bankAccounts.map(ba => ba.id === id ? { ...ba, ...updates } : ba));
  };

  const updateCard = (id: string, updates: Partial<CreditCard>) => {
    setCards(cards.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-bold text-xl tracking-tight text-[#2563EB]">
              Finanza<span className="text-[#64748B] ml-1">Flow</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowCardManager(!showCardManager)}
              className="p-2 text-[#64748B] hover:text-[#2563EB] transition-colors"
              title="Gerenciar Cartões"
            >
              <CreditCardIcon className="w-5 h-5" />
            </button>
            <nav className="flex gap-1 bg-[#F1F5F9] p-1 rounded-xl">
              {(['dashboard', 'transactions', 'debts', 'cards', 'accounts'] as const).map((tab) => (
                <button
                  key={tab}
                  id={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  {tab === 'accounts' ? 'Bancos' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence>
          {showCardManager && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-white border border-[#E2E8F0] p-6 rounded-xl shadow-md">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-[#1E293B] flex items-center gap-2">
                    <CreditCardIcon className="w-4 h-4 text-[#2563EB]" /> Meus Cartões
                  </h3>
                  <button onClick={() => setShowCardManager(false)} className="text-xs font-bold text-[#2563EB] uppercase">Fechar</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {cards.map((card, idx) => (
                    <div key={card.id} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                      <input 
                        className="font-bold text-sm bg-transparent border-none outline-none w-full mb-2"
                        value={card.name}
                        onChange={(e) => {
                          const newCards = [...cards];
                          newCards[idx].name = e.target.value;
                          setCards(newCards);
                        }}
                      />
                      <div className="space-y-3">
                        <div>
                          <label className="text-[9px] font-bold text-[#94A3B8] uppercase block mb-1">Limite (R$)</label>
                          <input 
                            type="number"
                            className="w-full bg-white border border-[#E2E8F0] p-2 rounded text-xs outline-none"
                            value={card.limit}
                            onChange={(e) => {
                              const newCards = [...cards];
                              newCards[idx].limit = Number(e.target.value);
                              setCards(newCards);
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-[#94A3B8] uppercase block mb-1">Fecham.</label>
                            <input 
                              type="number"
                              className="w-full bg-white border border-[#E2E8F0] p-2 rounded text-xs outline-none"
                              value={card.closingDay}
                              onChange={(e) => {
                                const newCards = [...cards];
                                newCards[idx].closingDay = Number(e.target.value);
                                setCards(newCards);
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-[#94A3B8] uppercase block mb-1">Vencim.</label>
                            <input 
                              type="number"
                              className="w-full bg-white border border-[#E2E8F0] p-2 rounded text-xs outline-none"
                              value={card.dueDay}
                              onChange={(e) => {
                                const newCards = [...cards];
                                newCards[idx].dueDay = Number(e.target.value);
                                setCards(newCards);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Saldo Total (Bancos)</p>
                  <p className={`text-3xl font-bold ${metrics.balance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {formatCurrency(metrics.balance)}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Dívidas Gerais</p>
                  <p className="text-3xl font-bold text-[#DC2626]">
                    {formatCurrency(debts.filter(d => !d.creditor.startsWith('Fatura:')).reduce((acc, d) => acc + d.remainingAmount, 0))}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-center gap-2">
                  <button 
                    onClick={() => { setActiveTab('accounts'); setIsAddingIncome(true); }}
                    className="w-full bg-[#16A34A] text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#15803d] transition-colors"
                  >
                    + Adicionar Receita
                  </button>
                  <button 
                    onClick={() => { setActiveTab('transactions'); setIsAddingTransaction(true); }}
                    className="w-full bg-[#2563EB] text-white py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#1D4ED8] transition-colors"
                  >
                    + Novo Gasto
                  </button>
                  <button 
                    onClick={() => { setActiveTab('accounts'); setIsTransferring(true); }}
                    className="w-full bg-white text-[#2563EB] border border-[#2563EB] py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#EFF6FF] transition-colors"
                  >
                    Transferir Saldo
                  </button>
                </div>
                <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Total Faturas</p>
                  <p className="text-3xl font-bold text-[#F59E0B]">
                    {formatCurrency(debts.filter(d => d.creditor.startsWith('Fatura:')).reduce((acc, d) => acc + d.remainingAmount, 0))}
                  </p>
                </div>
              </div>

              {/* Main Content Grid 8/4 */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Debts Preview (Span 8) */}
                <div className="md:col-span-8 bg-white rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col overflow-hidden">
                  <div className="p-5 border-b border-[#F1F5F9] bg-[#FCFCFD] flex justify-between items-center">
                    <h2 className="font-bold text-sm uppercase tracking-tight text-[#1E293B]">Próximos Pagamentos</h2>
                    <button onClick={() => setActiveTab('debts')} className="text-[11px] font-bold text-[#2563EB] hover:underline uppercase tracking-wide">Gerenciar Proventos</button>
                  </div>
                  <div className="overflow-auto max-h-[400px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[#FCFCFD] border-b border-[#F1F5F9]">
                          <th className="px-5 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Credor / Fatura</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Valor</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Conta p/ Pagar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {debts.filter(d => d.status !== 'paid').sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 8).map((debt) => (
                          <tr key={debt.id} className="hover:bg-[#F8FAFC] transition-colors text-sm">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-[#1E293B]">{debt.creditor}</p>
                              <p className="text-[10px] text-[#94A3B8] font-bold uppercase">{new Date(debt.dueDate).toLocaleDateString('pt-BR')}</p>
                            </td>
                            <td className="px-5 py-3.5 font-bold text-[#DC2626]">
                              {formatCurrency(debt.remainingAmount)}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex gap-2">
                                <select 
                                  id={`pay-account-${debt.id}`}
                                  className="text-[10px] font-bold bg-[#F8FAFC] border border-[#E2E8F0] p-1 rounded outline-none"
                                >
                                  {bankAccounts.map(ba => <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                                </select>
                                <button
                                  onClick={() => {
                                    const select = document.getElementById(`pay-account-${debt.id}`) as HTMLSelectElement;
                                    registerPayment(debt.id, debt.remainingAmount, select.value);
                                  }}
                                  className="bg-[#EFF6FF] text-[#2563EB] px-3 py-1 rounded-md text-[10px] font-bold hover:bg-[#2563EB] hover:text-white transition-all whitespace-nowrap"
                                >
                                  Pagar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bank status (Span 4) */}
                <div className="md:col-span-4 space-y-4">
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                    <h2 className="font-bold text-xs uppercase tracking-wide text-[#1E293B] mb-4">Saldos Bancários (Edição Manual)</h2>
                    <div className="space-y-3">
                      {bankAccounts.map(account => (
                        <div key={account.id} className="flex justify-between items-center p-3 rounded-lg bg-[#F8FAFC] border border-[#F1F5F9]">
                          <p className="text-[11px] font-bold text-[#64748B] uppercase">{account.name}</p>
                          <input 
                            type="number" 
                            step="0.01"
                            className="font-black text-sm text-[#1E293B] bg-transparent text-right outline-none focus:text-[#2563EB] w-24"
                            value={account.balance}
                            onChange={(e) => updateBankAccount(account.id, { balance: Number(e.target.value) })}
                          />
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setActiveTab('accounts')}
                      className="w-full mt-4 text-[10px] font-bold text-[#2563EB] uppercase hover:underline"
                    >
                      Gerenciar Contas
                    </button>
                  </div>

                  {cards.map(card => {
                    const invoiceTotal = debts
                      .filter(d => d.creditor.includes(card.name) && d.status !== 'paid')
                      .reduce((acc, d) => acc + d.remainingAmount, 0);
                    const usagePercent = Math.min(100, (invoiceTotal / card.limit) * 100);
                    
                    return (
                      <div key={card.id} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <p className="font-bold text-xs uppercase tracking-wide text-[#1E293B]">{card.name}</p>
                          <p className="text-[10px] font-bold text-[#94A3B8]">Limite: {formatCurrency(card.limit)}</p>
                        </div>
                        <div className="w-full bg-[#F1F5F9] h-1.5 rounded-full mb-3">
                          <div className={`h-full rounded-full transition-all`} style={{ width: `${usagePercent}%`, backgroundColor: usagePercent > 80 ? '#DC2626' : card.color }} />
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[9px] font-bold text-[#94A3B8] uppercase">Utilizado</p>
                            <p className="text-lg font-black text-[#1E293B]">{formatCurrency(invoiceTotal)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#94A3B8] uppercase text-right">Disponível</p>
                            <p className="text-sm font-bold text-[#16A34A]">{formatCurrency(card.limit - invoiceTotal)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'accounts' && (
            <motion.div
              key="accounts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1E293B]">Minhas Contas</h2>
                <button
                  onClick={() => setIsTransferring(!isTransferring)}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                >
                  <ArrowUpCircle className="w-4 h-4" /> Nova Transferência
                </button>
              </div>

              {isAddingIncome && (
                <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-md max-w-md">
                  <h3 className="font-bold mb-4 text-[#1E293B]">Adicionar Receita (Depósito/Pix)</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    addTransaction({
                      description: fd.get('description') as string,
                      amount: Number(fd.get('amount')),
                      type: 'income',
                      category: 'Receita',
                      date: fd.get('date') as string,
                    }, undefined, fd.get('bankAccountId') as string);
                    setIsAddingIncome(false);
                  }} className="space-y-4 text-sm">
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Descrição</label>
                      <input name="description" required placeholder="Ex: Salário, Venda..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Destino</label>
                      <select name="bankAccountId" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        {bankAccounts.map(ba => <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Valor (R$)</label>
                      <input name="amount" type="number" step="0.01" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Data</label>
                      <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div className="pt-2 flex gap-3">
                      <button type="submit" className="flex-1 bg-[#16A34A] text-white py-2.5 rounded-lg font-bold">Adicionar</button>
                      <button type="button" onClick={() => setIsAddingIncome(false)} className="flex-1 bg-[#F1F5F9] text-[#64748B] py-2.5 rounded-lg font-bold">Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              {isTransferring && (
                <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-md max-w-md">
                  <h3 className="font-bold mb-4 text-[#1E293B]">Transferir entre Contas</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    transferFunds(
                      fd.get('fromId') as string,
                      fd.get('toId') as string,
                      Number(fd.get('amount'))
                    );
                  }} className="space-y-4 text-sm">
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Origem</label>
                      <select name="fromId" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        {bankAccounts.map(ba => <option key={ba.id} value={ba.id}>{ba.name} ({formatCurrency(ba.balance)})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Destino</label>
                      <select name="toId" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        {bankAccounts.map(ba => <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Valor (R$)</label>
                      <input name="amount" type="number" step="0.01" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div className="pt-2 flex gap-3">
                      <button type="submit" className="flex-1 bg-[#2563EB] text-white py-2.5 rounded-lg font-bold hover:bg-[#1D4ED8]">Transferir</button>
                      <button type="button" onClick={() => setIsTransferring(false)} className="flex-1 bg-[#F1F5F9] text-[#64748B] py-2.5 rounded-lg font-bold">Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {bankAccounts.map((account, idx) => (
                  <div key={account.id} className="bg-white rounded-xl border border-[#E2E8F0] shadow-md overflow-hidden p-6 relative">
                    <div className="flex justify-between items-start mb-6">
                      <div className="p-3 rounded-xl bg-[#F1F5F9]">
                        <Wallet className="w-6 h-6 text-[#2563EB]" />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Saldo Atual</span>
                        <input 
                          type="number"
                          step="0.01"
                          className="text-2xl font-black text-[#1E293B] bg-transparent text-right outline-none focus:text-[#2563EB] w-40"
                          value={account.balance}
                          onChange={(e) => updateBankAccount(account.id, { balance: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Nome da Conta</label>
                        <input 
                          className="w-full font-bold text-sm bg-transparent border-b border-[#E2E8F0] pb-1 outline-none focus:border-[#2563EB]"
                          value={account.name}
                          onChange={(e) => {
                            const newAccounts = [...bankAccounts];
                            newAccounts[idx].name = e.target.value;
                            setBankAccounts(newAccounts);
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-[#64748B]">Esta conta é utilizada para pagar cartões e registrar gastos no Débito/Pix.</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'cards' && (
            <motion.div
              key="cards"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1E293B]">Meus Cartões de Crédito</h2>
                <button
                  onClick={() => setShowCardManager(!showCardManager)}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                >
                  <CreditCardIcon className="w-4 h-4" /> Configurar Limites
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map(card => {
                  const cardDebts = debts.filter(d => d.creditor.includes(card.name) && d.status !== 'paid');
                  const invoiceTotal = cardDebts.reduce((acc, d) => acc + d.remainingAmount, 0);
                  const usagePercent = Math.min(100, (invoiceTotal / card.limit) * 100);
                  
                  return (
                    <div key={card.id} className="bg-white rounded-xl border border-[#E2E8F0] shadow-md overflow-hidden">
                      <div className={`h-2`} style={{ backgroundColor: card.color }} />
                      <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <input 
                            className="font-black text-xl text-[#1E293B] bg-transparent outline-none focus:text-[#2563EB] w-full"
                            value={card.name}
                            onChange={(e) => updateCard(card.id, { name: e.target.value })}
                          />
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Fecha:</span>
                            <input 
                              type="number"
                              className="text-[10px] font-bold text-[#94A3B8] uppercase bg-transparent outline-none w-6"
                              value={card.closingDay}
                              onChange={(e) => updateCard(card.id, { closingDay: Number(e.target.value) })}
                            />
                            <span className="mx-1 text-[#CBD5E1]">•</span>
                            <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Vence:</span>
                            <input 
                              type="number"
                              className="text-[10px] font-bold text-[#94A3B8] uppercase bg-transparent outline-none w-6"
                              value={card.dueDay}
                              onChange={(e) => updateCard(card.id, { dueDay: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                        <CreditCardIcon className="w-6 h-6 text-[#CBD5E1]" />
                      </div>

                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-[10px] font-bold uppercase mb-1.5">
                              <span className="text-[#64748B]">Utilização do Limite</span>
                              <span style={{ color: usagePercent > 80 ? '#DC2626' : card.color }}>{usagePercent.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-[#F1F5F9] h-2 rounded-full">
                              <div className={`h-full rounded-full transition-all`} style={{ width: `${usagePercent}%`, backgroundColor: usagePercent > 80 ? '#DC2626' : card.color }} />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#F1F5F9]">
                              <p className="text-[9px] font-bold text-[#94A3B8] uppercase">Fatura Atual</p>
                              <p className="text-lg font-black text-[#E11D48]">{formatCurrency(invoiceTotal)}</p>
                            </div>
                            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#F1F5F9]">
                              <p className="text-[9px] font-bold text-[#94A3B8] uppercase">Limite Disp.</p>
                              <p className="text-lg font-black text-[#16A34A]">{formatCurrency(card.limit - invoiceTotal)}</p>
                            </div>
                          </div>

                          <div className="pt-4 space-y-2">
                            <p className="text-[10px] font-bold text-[#94A3B8] uppercase border-b border-[#F1F5F9] pb-1">Faturas em Aberto</p>
                            {cardDebts.length > 0 ? cardDebts.map(d => (
                              <div key={d.id} className="flex justify-between text-xs py-1">
                                <span className="text-[#64748B] font-medium">{d.creditor.split('(')[1]?.replace(')', '') || 'Fatura'}</span>
                                <span className="font-bold text-[#1E293B]">{formatCurrency(d.remainingAmount)}</span>
                              </div>
                            )) : (
                              <p className="text-[10px] text-[#CBD5E1] italic py-2">Nenhuma fatura pendente</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'transactions' && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1E293B]">Transações</h2>
                <button
                  id="btn-add-transaction-view"
                  onClick={() => setIsAddingTransaction(!isAddingTransaction)}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                >
                  <PlusCircle className="w-4 h-4" /> {isAddingTransaction ? 'Fechar' : 'Nova Transação'}
                </button>
              </div>

              {isAddingTransaction && (
                <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-md">
                  <h3 className="font-bold mb-4 text-[#1E293B]">Adicionar Movimentação</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const method = fd.get('method') as string;
                    const [type, id] = method.split(':');
                    
                    addTransaction({
                      description: fd.get('description') as string,
                      amount: Number(fd.get('amount')),
                      type: fd.get('type') as 'income' | 'expense',
                      category: fd.get('category') as string,
                      date: fd.get('date') as string,
                    }, type === 'cc' ? id : undefined, type === 'ba' ? id : undefined);
                  }} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Descrição</label>
                      <input name="description" required placeholder="Salário, Jantar..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Valor (R$)</label>
                      <input name="amount" type="number" step="0.01" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Tipo</label>
                      <select name="type" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        <option value="expense">Saída</option>
                        <option value="income">Entrada</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Categoria</label>
                      <input name="category" required placeholder="Lazer, Contas..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Data</label>
                      <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Método / Conta (Pix ou Débito)</label>
                      <select name="method" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        <optgroup label="Pagar com Cartão (Fatura)">
                          {cards.map(card => (
                            <option key={card.id} value={`cc:${card.id}`}>{card.name} (Limite: {formatCurrency(card.limit)})</option>
                          ))}
                        </optgroup>
                        <optgroup label="Sair do Saldo (Pix / Débito)">
                          {bankAccounts.map(ba => (
                            <option key={ba.id} value={`ba:${ba.id}`}>{ba.name} (Saldo: {formatCurrency(ba.balance)})</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div className="md:col-span-2 pt-2 flex gap-3">
                      <button type="submit" className="flex-1 bg-[#2563EB] text-white py-2.5 rounded-lg font-bold hover:bg-[#1D4ED8]">Confirmar</button>
                      <button type="button" onClick={() => setIsAddingTransaction(false)} className="flex-1 bg-[#F1F5F9] text-[#64748B] py-2.5 rounded-lg font-bold">Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-[#FCFCFD] border-b border-[#F1F5F9]">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Info</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider text-right">Valor</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-6 py-4">
                          <input 
                            className="font-semibold text-sm bg-transparent outline-none focus:text-[#2563EB] w-full"
                            value={t.description}
                            onChange={(e) => updateTransaction(t.id, { description: e.target.value })}
                          />
                          <div className="flex items-center gap-2 mt-0.5">
                            <input 
                              type="date"
                              className="text-[10px] text-[#94A3B8] font-bold uppercase bg-transparent outline-none"
                              value={t.date}
                              onChange={(e) => updateTransaction(t.id, { date: e.target.value })}
                            />
                            <span className="text-[10px] text-[#CBD5E1]">•</span>
                            <input 
                              className="text-[10px] text-[#94A3B8] font-bold uppercase bg-transparent outline-none w-20"
                              value={t.category}
                              onChange={(e) => updateTransaction(t.id, { category: e.target.value })}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end">
                            <span className={`font-bold text-sm mr-1 ${t.type === 'income' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                              {t.type === 'income' ? '+' : '-'}
                            </span>
                            <input 
                              type="number"
                              step="0.01"
                              className={`font-bold text-sm bg-transparent outline-none text-right w-24 ${t.type === 'income' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}
                              value={t.amount}
                              onChange={(e) => updateTransaction(t.id, { amount: Number(e.target.value) })}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => deleteTransaction(t.id)} className="text-[#CBD5E1] hover:text-[#DC2626] transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'debts' && (
            <motion.div
              key="debts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#1E293B]">Controle de Dívidas</h2>
                <button
                  id="btn-add-debt-view"
                  onClick={() => setIsAddingDebt(!isAddingDebt)}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                >
                  <PlusCircle className="w-4 h-4" /> {isAddingDebt ? 'Fechar' : 'Nova Dívida'}
                </button>
              </div>

              {isAddingDebt && (
                <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-md">
                  <h3 className="font-bold mb-4 text-[#1E293B]">Cadastrar Nova Dívida / Conta</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const type = fd.get('type') as 'fixed' | 'unique' | 'installments';
                    const installments = Number(fd.get('installments') || 1);
                    
                    addDebt({
                      creditor: fd.get('creditor') as string,
                      totalAmount: Number(fd.get('amount')),
                      dueDate: fd.get('dueDate') as string,
                      type
                    }, installments);
                  }} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Credor / Descrição</label>
                      <input name="creditor" required placeholder="Aluguel, Internet, Compra Loja..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Valor {activeTab === 'debts' ? 'Total' : ''} (R$)</label>
                      <input name="amount" type="number" step="0.01" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Tipo de Lançamento</label>
                      <select name="type" required defaultValue="unique" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        <option value="unique">Única (Pagamento à vista)</option>
                        <option value="fixed">Fixa (Mensal Recorrente)</option>
                        <option value="installments">Parcelada</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Vencimento (1ª Parcela se for o caso)</label>
                      <input name="dueDate" type="date" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Qtd Parcelas (Apenas se Parcelada)</label>
                      <input name="installments" type="number" min="1" defaultValue="1" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div className="md:col-span-2 pt-2 flex gap-3">
                      <button type="submit" className="flex-1 bg-[#2563EB] text-white py-2.5 rounded-lg font-bold hover:bg-[#1D4ED8]">Salvar Lançamento</button>
                      <button type="button" onClick={() => setIsAddingDebt(false)} className="flex-1 bg-[#F1F5F9] text-[#64748B] py-2.5 rounded-lg font-bold">Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {debts.map((debt) => (
                  <div key={debt.id} className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm relative overflow-hidden group">
                    {debt.status === 'paid' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#16A34A]" />}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <input 
                            className="font-bold text-lg text-[#1E293B] bg-transparent outline-none focus:text-[#2563EB]"
                            value={debt.creditor}
                            onChange={(e) => updateDebt(debt.id, { creditor: e.target.value })}
                            onBlur={(e) => {
                              if (debt.installmentInfo || debt.recurringGroupId) {
                                if (window.confirm("Deseja aplicar este nome a esta e todas as parcelas FUTURAS?")) {
                                  updateDebtSmart(debt.id, { creditor: e.target.value }, true);
                                }
                              }
                            }}
                          />
                          {debt.installmentInfo && (
                            <span className="text-xs text-[#64748B] font-medium">({debt.installmentInfo.current}/{debt.installmentInfo.total})</span>
                          )}
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            debt.status === 'paid' ? 'bg-[#F0FDF4] text-[#166534]' : 'bg-[#FEF2F2] text-[#991B1B]'
                          }`}>
                            {debt.status === 'paid' ? 'Liquidada' : debt.remainingAmount < debt.totalAmount ? 'Baixa Parcial' : 'Em Aberto'}
                          </span>
                          <span className="text-[10px] font-bold uppercase text-[#94A3B8] bg-[#F1F5F9] px-2 py-0.5 rounded">
                            {debt.type === 'installments' ? 'Parcelada' : debt.type === 'fixed' ? 'Fixa' : 'Única'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-[#94A3B8] font-bold uppercase">Vencimento:</span>
                          <input 
                            type="date"
                            className="text-[11px] text-[#94A3B8] font-bold uppercase bg-transparent outline-none"
                            value={debt.dueDate}
                            onChange={(e) => updateDebt(debt.id, { dueDate: e.target.value })}
                          />
                        </div>
                        
                        {debt.payments && debt.payments.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[10px] font-bold text-[#64748B] uppercase mb-2">Histórico de Pagamentos</p>
                            <div className="space-y-1.5">
                              {debt.payments.map(p => (
                                <div key={p.id} className="flex justify-between items-center text-[11px] bg-[#F8FAFC] p-2 rounded border border-[#F1F5F9]">
                                  <span className="font-medium text-[#1E293B]">{new Date(p.date).toLocaleDateString('pt-BR')} via {p.bankAccountName}</span>
                                  <span className="font-bold text-[#16A34A]">{formatCurrency(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col md:items-end">
                        <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Saldo Devedor</p>
                        <input 
                          type="number"
                          step="0.01"
                          className={`text-2xl font-black bg-transparent text-right outline-none focus:text-[#2563EB] w-32 ${debt.status === 'paid' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}
                          value={debt.remainingAmount}
                          onChange={(e) => {
                            const rem = Number(e.target.value);
                            updateDebt(debt.id, { 
                              remainingAmount: rem,
                              status: rem <= 0 ? 'paid' : 'pending' 
                            });
                          }}
                          onBlur={(e) => {
                            if (debt.installmentInfo || debt.recurringGroupId) {
                              const val = Number(e.target.value);
                              if (window.confirm("Deseja aplicar este valor de saldo devedor a todas as parcelas FUTURAS?")) {
                                updateDebtSmart(debt.id, { remainingAmount: val, status: val <= 0 ? 'paid' : 'pending' }, true);
                              }
                            }
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[#CBD5E1] font-medium">Total:</span>
                          <input 
                             type="number"
                             step="0.01"
                             className="text-[10px] text-[#CBD5E1] font-medium bg-transparent text-right outline-none w-16"
                             value={debt.totalAmount}
                             onChange={(e) => updateDebt(debt.id, { totalAmount: Number(e.target.value) })}
                             onBlur={(e) => {
                               if (debt.installmentInfo || debt.recurringGroupId) {
                                 const val = Number(e.target.value);
                                 if (window.confirm("Deseja aplicar esta alteração de valor total a todas as parcelas FUTURAS?")) {
                                   updateDebtSmart(debt.id, { totalAmount: val }, true);
                                 }
                               }
                             }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-[#F1F5F9] flex items-center justify-between">
                      <div className="flex gap-4">
                        <button 
                          onClick={() => {
                            if (debt.installmentInfo || debt.recurringGroupId) {
                              if (window.confirm("Deseja excluir esta parcela e TODAS AS FUTURAS? (Clique 'Cancelar' para excluir apenas esta)")) {
                                deleteDebt(debt.id, true);
                              } else {
                                if (window.confirm("Deseja excluir APENAS esta parcela?")) {
                                  deleteDebt(debt.id, false);
                                }
                              }
                            } else {
                              if (window.confirm("Deseja excluir este lançamento?")) {
                                deleteDebt(debt.id);
                              }
                            }
                          }} 
                          className="text-[#CBD5E1] hover:text-[#DC2626] transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>

                        {(debt.installmentInfo || debt.recurringGroupId) && (
                          <button 
                            onClick={() => deleteSeries(debt.installmentInfo?.groupId || debt.recurringGroupId!)}
                            className="text-[10px] font-bold text-[#94A3B8] border border-[#E2E8F0] px-2 py-1 rounded hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-colors"
                          >
                            Limpar Série
                          </button>
                        )}

                        {debt.type === 'fixed' && !debt.isCancelled && (
                          <button 
                            onClick={() => {
                              if (window.confirm('Deseja encerrar a recorrência? As parcelas futuras deste grupo serão removidas.')) {
                                deleteDebt(debt.id, true);
                                updateDebt(debt.id, { isCancelled: true });
                              }
                            }}
                            className="text-[10px] font-bold text-[#E11D48] border border-[#FECDD3] px-2 py-1 rounded hover:bg-[#FFF1F2]"
                          >
                            Encerrar Recorrência
                          </button>
                        )}
                      </div>
                      
                      {debt.status !== 'paid' && (
                        <div className="flex items-center gap-2">
                          <select 
                            id={`pay-account-item-${debt.id}`}
                            className="bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 rounded-lg text-xs font-bold outline-none"
                          >
                            {bankAccounts.map(ba => <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                          </select>
                          <input
                            id={`pay-input-${debt.id}`}
                            type="number"
                            defaultValue={debt.remainingAmount}
                            className="w-24 bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 rounded-lg text-sm font-semibold outline-none focus:ring-1 focus:ring-[#2563EB]"
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById(`pay-input-${debt.id}`) as HTMLInputElement;
                              const select = document.getElementById(`pay-account-item-${debt.id}`) as HTMLSelectElement;
                              const val = Number(input.value);
                              if (val > 0) {
                                registerPayment(debt.id, val, select.value);
                                input.value = '';
                              }
                            }}
                            className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#1D4ED8] transition-all"
                          >
                            Pagar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-[#E2E8F0] mt-12 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-[0.2em]">FinanzaFlow Gestor © 2026</p>
          <div className="flex gap-4">
            <span className="text-[10px] font-bold text-[#CBD5E1] uppercase tracking-widest">Premium Service</span>
            <span className="text-[10px] font-bold text-[#CBD5E1] uppercase tracking-widest">Calculated Integrity</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
