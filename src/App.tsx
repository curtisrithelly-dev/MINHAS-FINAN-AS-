import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { PlusCircle, Wallet, ArrowUpCircle, ArrowDownCircle, CreditCard as CreditCardIcon, History, Trash2, Download, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Debt, CreditCard, BankAccount, DebtPayment } from './types';

export default function App() {
  // Initialize state from localStorage
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('transactions');
    return saved ? JSON.parse(saved) : [];
  });
  const [debts, setDebts] = useState<Debt[]>(() => {
    const saved = localStorage.getItem('debts');
    return saved ? JSON.parse(saved) : [];
  });
  const [cards, setCards] = useState<CreditCard[]>(() => {
    const saved = localStorage.getItem('cards');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'cc-1', name: 'Sicoob', limit: 1600, closingDay: 1, dueDay: 11, color: '#16A34A' },
      { id: 'cc-2', name: 'Mercado Pago', limit: 500, closingDay: 5, dueDay: 10, color: '#2563EB' },
      { id: 'cc-3', name: 'Nubank', limit: 200, closingDay: 12, dueDay: 20, color: '#9333EA' }
    ];
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    const saved = localStorage.getItem('bankAccounts');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'ba-1', name: 'Mercado Pago', balance: 3400.65, color: '#2563EB' },
      { id: 'ba-3', name: 'Nubank', balance: 0, color: '#9333EA' }
    ];
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'debts' | 'cards' | 'accounts' | 'negotiations'>('dashboard');
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isAddingIncome, setIsAddingIncome] = useState(false);
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showCardManager, setShowCardManager] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

  // Sync to localStorage
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
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDebt = debts
      .filter(d => {
        if (d.status === 'on_hold') return false;
        if (!d.dueDate) return false;
        const [dYear, dMonth] = d.dueDate.split('-').map(Number);
        return dYear === year && dMonth === month;
      })
      .reduce((acc, d) => acc + d.remainingAmount, 0);
      
    return { balance: totalBankBalance, totalDebt };
  }, [bankAccounts, debts, selectedMonth]);

  const cleanupDuplicates = () => {
    const seen = new Set<string>();
    const uniqueDebts = debts.filter(debt => {
      if (!debt.dueDate) return true;
      const [y, m] = debt.dueDate.split('-');
      // Chave única: Creditor + Ano + Mes + Valor (para identificar duplicatas do mesmo lançamento no mesmo mês)
      const key = `${debt.creditor}-${y}-${m}-${debt.totalAmount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueDebts.length !== debts.length) {
      if (window.confirm(`${debts.length - uniqueDebts.length} duplicatas encontradas. Deseja removê-las?`)) {
        setDebts(uniqueDebts);
      }
    } else {
      alert("Nenhuma duplicata encontrada.");
    }
  };

  // Handlers
  const addTransaction = (t: Omit<Transaction, 'id'>, cardId?: string, bankAccountId?: string) => {
    const id = crypto.randomUUID();
    const newTransaction: Transaction = { id, ...t, bankAccountId };

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
        handleCardInvoiceAutoDebt(t.amount, t.date, cardId);
      }
    }

    // 2. Balance updates for Bank Accounts
    if (bankAccountId) {
      const account = bankAccounts.find(ba => ba.id === bankAccountId);
      if (account) {
        if (t.type === 'expense' && account.balance < t.amount) {
          alert(`Saldo insuficiente na conta ${account.name}!`);
          return;
        }
        const newBalance = t.type === 'income' ? account.balance + t.amount : account.balance - t.amount;
        setBankAccounts(bankAccounts.map(ba => ba.id === bankAccountId ? { ...ba, balance: Number(newBalance.toFixed(2)) } : ba));
      }
    }

    setTransactions([newTransaction, ...transactions]);
    setIsAddingTransaction(false);
  };

  const transferFunds = (fromId: string, toId: string, amount: number) => {
    const fromAccount = bankAccounts.find(ba => ba.id === fromId);
    if (!fromAccount || fromAccount.balance < amount) {
      alert('Saldo insuficiente para transferência!');
      return;
    }

    const toAccount = bankAccounts.find(ba => ba.id === toId);
    setBankAccounts(bankAccounts.map(ba => {
      if (ba.id === fromId) return { ...ba, balance: Number((ba.balance - amount).toFixed(2)) };
      if (ba.id === toId) return { ...ba, balance: Number((ba.balance + amount).toFixed(2)) };
      return ba;
    }));

    const date = new Date().toISOString().split('T')[0];
    addTransaction({
      description: `Transferência enviada para ${toAccount?.name}`,
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

    const [pYear, pMonth, pDay] = dateString.split('-').map(Number);
    
    let tYear = pYear;
    let tMonth = pMonth - 1; // 0-indexed para Date
    
    if (pDay > card.closingDay) {
      tMonth++;
    }
    
    const targetDate = new Date(tYear, tMonth, card.dueDay);
    
    const monthYearLabel = targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const creditorName = `Fatura: ${card.name} (${monthYearLabel})`;
    
    const y = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dueDateString = `${y}-${mm}-${dd}`;

    const existingDebtIndex = debts.findIndex(d => d.creditor === creditorName && d.status !== 'paid');

    if (existingDebtIndex >= 0) {
      const updatedDebts = [...debts];
      updatedDebts[existingDebtIndex] = {
        ...updatedDebts[existingDebtIndex],
        totalAmount: Number((updatedDebts[existingDebtIndex].totalAmount + amount).toFixed(2)),
        remainingAmount: Number((updatedDebts[existingDebtIndex].remainingAmount + amount).toFixed(2))
      };
      setDebts(updatedDebts);
    } else {
      const newDebt: Debt = {
        id: crypto.randomUUID(),
        creditor: creditorName,
        totalAmount: amount,
        remainingAmount: amount,
        dueDate: dueDateString,
        status: 'pending',
        payments: []
      };
      setDebts([...debts, newDebt]);
    }
  };

  const addDebt = (d: Omit<Debt, 'id' | 'remainingAmount' | 'status' | 'payments'>, installments: number = 1) => {
    let newDebts: Debt[] = [];
    
    if (d.type === 'installments' && installments > 1) {
      const groupId = crypto.randomUUID();
      const installmentAmount = Number((d.totalAmount / installments).toFixed(2));
      
      for (let i = 1; i <= installments; i++) {
        const dueDate = getNextMonthDate(d.dueDate, i - 1);
        
        newDebts.push({
          ...d,
          id: crypto.randomUUID(),
          totalAmount: installmentAmount,
          remainingAmount: installmentAmount,
          dueDate: dueDate,
          status: 'pending',
          payments: [],
          installmentInfo: {
            current: i,
            total: installments,
            groupId
          }
        });
      }
    } else if (d.type === 'fixed') {
      const recurringGroupId = crypto.randomUUID();
      for (let i = 0; i < 12; i++) {
        const dueDate = getNextMonthDate(d.dueDate, i);
        newDebts.push({
          ...d,
          id: crypto.randomUUID(),
          remainingAmount: d.totalAmount,
          dueDate: dueDate,
          status: 'pending',
          payments: [],
          recurringGroupId
        });
      }
    } else {
      newDebts.push({
        ...d,
        id: crypto.randomUUID(),
        remainingAmount: d.totalAmount,
        status: 'pending',
        payments: []
      });
    }
    
    setDebts([...debts, ...newDebts]);
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
    const newPayment: DebtPayment = {
      id: crypto.randomUUID(),
      amount: paymentAmount,
      date: new Date().toISOString().split('T')[0],
      bankAccountId,
      bankAccountName: account.name
    };

    const remaining = Number((debt.remainingAmount - paymentAmount).toFixed(2));
    
    setDebts(debts.map(d => d.id === debtId ? {
      ...d,
      remainingAmount: remaining,
      status: remaining <= 0 ? 'paid' : d.status,
      payments: [...(d.payments || []), newPayment]
    } : d));

    setBankAccounts(bankAccounts.map(ba => ba.id === bankAccountId ? { ...ba, balance: Number((ba.balance - paymentAmount).toFixed(2)) } : ba));

    addTransaction({
      amount: paymentAmount,
      type: 'expense',
      category: 'Dívida',
      date: new Date().toISOString().split('T')[0],
      description: `Pagamento: ${debt.creditor} ${debt.installmentInfo ? `(${debt.installmentInfo.current}/${debt.installmentInfo.total})` : ''}`,
    }, undefined, bankAccountId);
  };

  const deleteDebt = (id: string, cascade: boolean = false, keepCurrent: boolean = false) => {
    const target = debts.find(d => d.id === id);
    if (!target) return;

    if (cascade && (target.installmentInfo || target.recurringGroupId)) {
      const gid = target.installmentInfo?.groupId || target.recurringGroupId;
      if (!gid) {
        setDebts(debts.filter(d => d.id !== id));
        return;
      }
      const targetDate = target.dueDate;
      setDebts(debts.filter(d => {
        const dGid = d.installmentInfo?.groupId || d.recurringGroupId;
        if (dGid !== gid) return true;
        const dDateValue = d.dueDate || '';
        if (keepCurrent) {
          return dDateValue <= targetDate; // Keep current, remove future
        }
        return dDateValue < targetDate; // Remove current and future
      }));
    } else {
      setDebts(debts.filter(d => d.id !== id));
    }
  };

  const deleteSeries = (groupId: string) => {
    if (window.confirm('Tem certeza que deseja apagar toda a série de parcelas? Esta ação é irreversível.')) {
      setDebts(debts.filter(d => (d.installmentInfo?.groupId !== groupId && d.recurringGroupId !== groupId)));
    }
  };

  const updateDebtSmart = (id: string, updates: Partial<Debt>, applyToFuture: boolean = false) => {
    const target = debts.find(d => d.id === id);
    if (!target) return;

    if (applyToFuture && (target.installmentInfo || target.recurringGroupId)) {
      const gid = target.installmentInfo?.groupId || target.recurringGroupId;
      const targetDate = target.dueDate;
      setDebts(debts.map(d => {
        const dGid = d.installmentInfo?.groupId || d.recurringGroupId;
        if (dGid === gid && (d.dueDate || '') >= targetDate) {
          return { ...d, ...updates };
        }
        return d;
      }));
    } else {
      setDebts(debts.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  };

  const deleteTransaction = (id: string) => setTransactions(transactions.filter(t => t.id !== id));
  const updateTransaction = (id: string, updates: Partial<Transaction>) => setTransactions(transactions.map(t => t.id === id ? { ...t, ...updates } : t));
  const updateDebt = (id: string, updates: Partial<Debt>) => setDebts(debts.map(d => d.id === id ? { ...d, ...updates } : d));
  const updateBankAccount = (id: string, updates: Partial<BankAccount>) => setBankAccounts(bankAccounts.map(ba => ba.id === id ? { ...ba, ...updates } : ba));
  
  const deleteBankAccount = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta conta?')) {
      setBankAccounts(bankAccounts.filter(ba => ba.id !== id));
    }
  };

  const updateCard = (id: string, updates: Partial<CreditCard>) => setCards(cards.map(c => c.id === id ? { ...c, ...updates } : c));

  const exportBackup = () => {
    const backupData = {
      transactions,
      debts,
      cards,
      bankAccounts,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_financa_curti_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm('Atenção: A restauração de backup irá substituir todos os seus dados atuais. Deseja continuar?')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.transactions || !data.debts || !data.cards || !data.bankAccounts) {
          throw new Error('Arquivo de backup inválido');
        }
        setTransactions(data.transactions);
        setDebts(data.debts);
        setCards(data.cards);
        setBankAccounts(data.bankAccounts);
        alert('Backup restaurado com sucesso! Seus dados foram sincronizados.');
      } catch (error) {
        alert('Erro ao processar arquivo de backup: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
  };

  const getNextMonthDate = (dateStr: string, monthsToAdd: number): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1 + monthsToAdd, day);
    
    // Validar se o mês transbordou (ex: 31 de janeiro + 1 mês = 3 de março)
    const expectedMonth = (month - 1 + monthsToAdd) % 12;
    const normalizedExpectedMonth = expectedMonth < 0 ? expectedMonth + 12 : expectedMonth;
    
    if (d.getMonth() !== normalizedExpectedMonth) {
      d.setDate(0); // Retrocede para o último dia do mês pretendido
    }
    
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
        <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-auto md:h-16 flex flex-col md:flex-row items-center justify-between py-4 md:py-0 gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="font-bold text-xl tracking-tight text-[#2563EB]">
              Finanza<span className="text-[#64748B] ml-1">Curti</span>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <button 
                onClick={() => setShowCardManager(!showCardManager)}
                className="p-2 text-[#64748B] hover:text-[#2563EB] transition-colors"
                title="Gerenciar Cartões"
              >
                <CreditCardIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
                <button 
                  onClick={exportBackup}
                  className="p-1.5 text-[#64748B] hover:text-[#2563EB] transition-colors"
                  title="Exportar Backup"
                >
                  <Download className="w-4 h-4" />
                </button>
                <div className="w-[1px] h-3 bg-[#CBD5E1]"></div>
                <label className="p-1.5 text-[#64748B] hover:text-[#2563EB] transition-colors cursor-pointer" title="Importar Backup">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept=".json" onChange={importBackup} className="hidden" />
                </label>
              </div>
            </div>
            
            <nav className="flex gap-1 bg-[#F1F5F9] p-1 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
              <div className="flex gap-1 min-w-max">
                {(['dashboard', 'transactions', 'debts', 'negotiations', 'cards', 'accounts'] as const).map((tab) => (
                  <button
                    key={tab}
                    id={`tab-${tab}`}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-h-[40px] flex items-center justify-center ${
                      activeTab === tab ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
                    }`}
                  >
                    {tab === 'accounts' ? 'Bancos' : 
                     tab === 'negotiations' ? 'Negociações' :
                     tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </nav>

            <button 
              onClick={() => setShowCardManager(!showCardManager)}
              className="hidden md:block p-2 text-[#64748B] hover:text-[#2563EB] transition-colors"
              title="Gerenciar Cartões"
            >
              <CreditCardIcon className="w-5 h-5" />
            </button>

            {/* Mobile Backup Actions - moved to footer or a menu for better UX, but keeping here as small icons for now */}
            <div className="flex md:hidden items-center gap-4 w-full justify-center pb-2 border-t border-[#F1F5F9] pt-2 mt-1">
               <button 
                  onClick={exportBackup}
                  className="flex items-center gap-2 text-[10px] font-bold text-[#64748B] uppercase"
                >
                  <Download className="w-3 h-3" /> Exportar
                </button>
                <label className="flex items-center gap-2 text-[10px] font-bold text-[#64748B] uppercase cursor-pointer">
                  <Upload className="w-3 h-3" /> Importar
                  <input type="file" accept=".json" onChange={importBackup} className="hidden" />
                </label>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Month Selector */}
        <div className="flex items-center justify-between mb-6 bg-white p-3 rounded-2xl border border-[#E2E8F0] shadow-sm">
          <button 
            onClick={() => {
              const [y, m] = selectedMonth.split('-').map(Number);
              const d = new Date(y, m - 2, 1);
              setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-2 hover:bg-[#F1F5F9] rounded-xl transition-colors text-[#64748B]"
          >
            ←
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest">Período de Referência</span>
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-lg font-black text-[#2563EB] bg-transparent outline-none cursor-pointer"
            />
          </div>
          <button 
            onClick={() => {
              const [y, m] = selectedMonth.split('-').map(Number);
              const d = new Date(y, m, 1);
              setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-2 hover:bg-[#F1F5F9] rounded-xl transition-colors text-[#64748B]"
          >
            →
          </button>
        </div>

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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-white p-4 md:p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                  <p className="text-[9px] md:text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1 md:mb-2 text-center md:text-left">Saldo (Bancos)</p>
                  <p className={`text-xl md:text-3xl font-bold text-center md:text-left ${metrics.balance >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {formatCurrency(metrics.balance)}
                  </p>
                </div>
                <div className="bg-white p-4 md:p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                  <p className="text-[9px] md:text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1 md:mb-2 text-center md:text-left">Dívidas (Mês)</p>
                  <p className="text-xl md:text-3xl font-bold text-[#DC2626] text-center md:text-left">
                    {formatCurrency(metrics.totalDebt)}
                  </p>
                </div>
                <div className="bg-white p-4 md:p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-center gap-2 col-span-2 md:col-span-1">
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    <button 
                      onClick={() => { setActiveTab('accounts'); setIsAddingIncome(true); }}
                      className="w-full bg-[#16A34A] text-white py-2.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wide hover:bg-[#15803d]"
                    >
                      + Receita
                    </button>
                    <button 
                      onClick={() => { setActiveTab('transactions'); setIsAddingTransaction(true); }}
                      className="w-full bg-[#2563EB] text-white py-2.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wide hover:bg-[#1D4ED8]"
                    >
                      + Gasto
                    </button>
                  </div>
                  <button 
                    onClick={() => { setActiveTab('accounts'); setIsTransferring(true); }}
                    className="w-full bg-white text-[#2563EB] border border-[#2563EB] py-2 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wide"
                  >
                    Transferir
                  </button>
                </div>
                <div className="bg-white p-4 md:p-5 rounded-xl border border-[#E2E8F0] shadow-sm col-span-2 md:col-span-1">
                  <p className="text-[9px] md:text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1 md:mb-2 text-center md:text-left">Total Faturas</p>
                  <p className="text-xl md:text-3xl font-bold text-[#F59E0B] text-center md:text-left">
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
                    <button onClick={() => setActiveTab('debts')} className="text-[11px] font-bold text-[#2563EB] hover:underline uppercase tracking-wide">Ver Todos</button>
                  </div>
                  <div className="overflow-auto max-h-[500px]">
                    {/* Desktop Table */}
                    <table className="w-full text-left hidden md:table">
                      <thead>
                        <tr className="bg-[#FCFCFD] border-b border-[#F1F5F9]">
                          <th className="px-5 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Credor / Vencimento</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider text-right">Valor Restante</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {debts.filter(d => {
                          if (d.status === 'paid' || d.status === 'on_hold') return false;
                          const [y, m] = d.dueDate.split('-').map(Number);
                          const [selY, selM] = selectedMonth.split('-').map(Number);
                          return y === selY && m === selM;
                        }).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).map((debt) => (
                          <tr key={debt.id} className="hover:bg-[#F8FAFC] transition-colors group">
                            <td className="px-5 py-3.5">
                              <p className="font-bold text-[#1E293B] text-sm">{debt.creditor}</p>
                              <p className="text-[10px] text-[#2563EB] font-black uppercase tracking-tighter">
                                {formatDate(debt.dueDate)}
                              </p>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex flex-col items-end">
                                <input 
                                  type="number"
                                  step="0.01"
                                  className="w-24 text-right font-black text-sm text-[#DC2626] bg-transparent border-b border-transparent focus:border-[#FEE2E2] focus:bg-white outline-none px-1 rounded"
                                  defaultValue={debt.remainingAmount}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    if (val !== debt.remainingAmount) {
                                      updateDebt(debt.id, { 
                                        remainingAmount: val,
                                        status: val <= 0 ? 'paid' : 'pending'
                                      });
                                    }
                                  }}
                                />
                                <span className="text-[9px] font-bold text-[#CBD5E1] uppercase tracking-tighter">Clique p/ editar</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <select 
                                  id={`dash-pay-account-${debt.id}`}
                                  className="text-[10px] font-black bg-[#F1F5F9] border border-[#E2E8F0] p-1.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]"
                                >
                                  {bankAccounts.map(ba => ba && <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                                </select>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const select = document.getElementById(`dash-pay-account-${debt.id}`) as HTMLSelectElement;
                                    registerPayment(debt.id, debt.remainingAmount || 0, select?.value);
                                  }}
                                  className="bg-[#2563EB] text-white px-4 py-1.5 rounded-lg text-[10px] font-bold hover:bg-[#1D4ED8] shadow-sm transform active:scale-95 transition-all"
                                >
                                  Pagar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile Card List */}
                    <div className="md:hidden divide-y divide-[#F1F5F9]">
                      {debts.filter(d => {
                        if (d.status === 'paid' || d.status === 'on_hold') return false;
                        const [y, m] = d.dueDate.split('-').map(Number);
                        const [selY, selM] = selectedMonth.split('-').map(Number);
                        return y === selY && m === selM;
                      }).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).map((debt) => (
                        <div key={debt.id} className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-[#1E293B] text-sm">{debt.creditor}</p>
                              <p className="text-[10px] text-[#2563EB] font-black uppercase">
                                {formatDate(debt.dueDate)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-[#DC2626] font-mono">{formatCurrency(debt.remainingAmount)}</p>
                              <span className="text-[8px] font-bold text-[#CBD5E1] uppercase tracking-tighter italic">Pendente</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <select 
                              id={`dash-pay-account-mobile-${debt.id}`}
                              className="flex-1 text-[10px] font-black bg-[#F1F5F9] border border-[#E2E8F0] p-2.5 rounded-xl outline-none"
                            >
                              {bankAccounts.map(ba => ba && <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                            </select>
                            <button
                              onClick={() => {
                                const select = document.getElementById(`dash-pay-account-mobile-${debt.id}`) as HTMLSelectElement;
                                registerPayment(debt.id, debt.remainingAmount || 0, select?.value);
                              }}
                              className="bg-[#2563EB] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider"
                            >
                              Pagar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {debts.filter(d => d.status !== 'paid' && d.status !== 'on_hold').length === 0 && (
                      <div className="px-5 py-12 text-center text-[#94A3B8] font-medium text-xs italic">
                        Não há pagamentos pendentes selecionados.
                      </div>
                    )}
                  </div>
                </div>

                {/* Bank status (Span 4) */}
                <div className="md:col-span-4 space-y-4">
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                    <h2 className="font-bold text-xs uppercase tracking-wide text-[#1E293B] mb-4">Saldos Bancários (Edição Manual)</h2>
                    <div className="space-y-3">
                      {bankAccounts.map(account => (
                        <div key={account.id} className="flex justify-between items-center p-3 rounded-lg bg-[#F8FAFC] border border-[#F1F5F9]">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => deleteBankAccount(account.id)}
                              className="p-1 text-[#94A3B8] hover:text-[#EF4444] transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <p className="text-[11px] font-bold text-[#64748B] uppercase">{account.name}</p>
                          </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
                {/* Desktop Table */}
                <table className="w-full text-left hidden md:table">
                  <thead className="bg-[#FCFCFD] border-b border-[#F1F5F9]">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Info</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider text-right">Valor</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {transactions.filter(t => {
                      const [y, m] = t.date.split('-').map(Number);
                      const [selY, selM] = selectedMonth.split('-').map(Number);
                      return y === selY && m === selM;
                    }).map((t) => (
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

                {/* Mobile List View */}
                <div className="md:hidden divide-y divide-[#F1F5F9]">
                  {transactions.filter(t => {
                    const [y, m] = t.date.split('-').map(Number);
                    const [selY, selM] = selectedMonth.split('-').map(Number);
                    return y === selY && m === selM;
                  }).map((t) => (
                    <div key={t.id} className="p-4 space-y-2">
                       <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 pr-4">
                          <input 
                            className="font-bold text-sm bg-transparent outline-none focus:text-[#2563EB] w-full truncate"
                            value={t.description}
                            onChange={(e) => updateTransaction(t.id, { description: e.target.value })}
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <input 
                              type="date"
                              className="text-[9px] text-[#94A3B8] font-black uppercase bg-transparent"
                              value={t.date}
                              onChange={(e) => updateTransaction(t.id, { date: e.target.value })}
                            />
                            <span className="text-[9px] text-[#94A3B8] font-black uppercase">{t.category}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end">
                            <span className={`font-black text-sm ${t.type === 'income' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                              {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                            </span>
                          </div>
                          <button onClick={() => deleteTransaction(t.id)} className="text-[10px] font-bold text-[#DC2626] uppercase mt-1">Excluir</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                     <div className="p-8 text-center text-[#94A3B8] text-xs italic">Nenhuma transação encontrada.</div>
                  )}
                </div>
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
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-[#1E293B]">Controle de Dívidas</h2>
                <div className="flex gap-2 w-full md:w-auto">
                  <button 
                    onClick={cleanupDuplicates}
                    className="flex-1 md:flex-none px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-xs font-bold uppercase hover:bg-[#F1F5F9] transition-all"
                  >
                    Limpar Duplicatas
                  </button>
                  <button
                    id="btn-add-debt-view"
                    onClick={() => setIsAddingDebt(!isAddingDebt)}
                    className="flex-1 md:flex-none bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                  >
                    <PlusCircle className="w-4 h-4" /> {isAddingDebt ? 'Fechar' : 'Nova Dívida'}
                  </button>
                </div>
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
                {debts.filter(d => {
                  if (d.status === 'on_hold') return false;
                  if (!d.dueDate) return false;
                  const [y, m] = d.dueDate.split('-').map(Number);
                  const [selY, selM] = selectedMonth.split('-').map(Number);
                  return y === selY && m === selM;
                }).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).map((debt) => {
                  const isEditing = editingDebtId === debt.id;
                  
                  return (
                    <div 
                      key={debt.id} 
                      className={`bg-white p-6 rounded-2xl border transition-all ${isEditing ? 'border-[#2563EB] shadow-lg ring-1 ring-[#2563EB]/10' : 'border-[#E2E8F0] shadow-sm'}`}
                    >
                      <div className="flex flex-col gap-6">
                        {/* Header Info */}
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex-1 space-y-4">
                            <div className="flex items-center flex-wrap gap-2">
                              {isEditing ? (
                                <input 
                                  id={`edit-creditor-${debt.id}`}
                                  type="text"
                                  className="font-bold text-lg text-[#1E293B] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB] w-full"
                                  defaultValue={debt.creditor}
                                />
                              ) : (
                                <h3 className="font-black text-xl text-[#1E293B] tracking-tight">{debt.creditor}</h3>
                              )}
                              {debt.installmentInfo && (
                                <span className="text-xs text-[#64748B] font-bold bg-[#F1F5F9] px-2 py-1 rounded-md">
                                  {debt.installmentInfo.current}/{debt.installmentInfo.total}
                                </span>
                              )}
                              <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${
                                debt.status === 'paid' ? 'bg-[#DCFCE7] text-[#166534]' : 
                                debt.status === 'on_hold' ? 'bg-[#FEF3C7] text-[#92400E]' :
                                'bg-[#FEE2E2] text-[#991B1B]'
                              }`}>
                                {debt.status === 'paid' ? 'Liquidada' : 
                                 debt.status === 'on_hold' ? 'Em Espera' : 'Pendente'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col">
                                <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest mb-1">Vencimento</label>
                                {isEditing ? (
                                  <input 
                                    id={`edit-date-${debt.id}`}
                                    type="date"
                                    className="text-sm font-bold text-[#1E293B] bg-[#F8FAFC] border border-[#E2E8F0] p-2 rounded-lg outline-none"
                                    defaultValue={debt.dueDate || ''}
                                  />
                                ) : (
                                  <p className="text-sm font-bold text-[#1E293B]">{debt.dueDate ? formatDate(debt.dueDate) : 'Sem data'}</p>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest mb-1">Total Lançado</label>
                                {isEditing ? (
                                  <input 
                                    id={`edit-total-${debt.id}`}
                                    type="number"
                                    className="text-sm font-bold text-[#1E293B] bg-[#F8FAFC] border border-[#E2E8F0] p-2 rounded-lg outline-none"
                                    defaultValue={debt.totalAmount}
                                    step="0.01"
                                  />
                                ) : (
                                  <p className="text-sm font-bold text-[#64748B]">{formatCurrency(debt.totalAmount)}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col md:items-end gap-2">
                            <label className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest">Saldo Devedor</label>
                            {isEditing ? (
                              <input 
                                id={`edit-remaining-${debt.id}`}
                                type="number"
                                className="text-3xl font-black text-[#DC2626] bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-xl outline-none text-right w-full md:w-36 focus:ring-4 focus:ring-[#DC2626]/5"
                                defaultValue={debt.remainingAmount}
                                step="0.01"
                              />
                            ) : (
                              <p className={`text-4xl font-black ${debt.status === 'paid' ? 'text-[#16A34A]' : 'text-[#DC2626]'} tracking-tighter`}>
                                {formatCurrency(debt.remainingAmount)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-[#F1F5F9]">
                          <div className="flex flex-wrap gap-2 items-center">
                            {!isEditing ? (
                              <button 
                                onClick={() => setEditingDebtId(debt.id)}
                                className="flex items-center gap-2 bg-[#F1F5F9] text-[#1E293B] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-[#E2E8F0] transition-all"
                              >
                                Editar
                              </button>
                            ) : (
                              <div className="flex gap-2 w-full sm:w-auto">
                                <button 
                                  onClick={() => {
                                    const creditor = (document.getElementById(`edit-creditor-${debt.id}`) as HTMLInputElement).value;
                                    const date = (document.getElementById(`edit-date-${debt.id}`) as HTMLInputElement).value;
                                    const total = Number((document.getElementById(`edit-total-${debt.id}`) as HTMLInputElement).value);
                                    const remaining = Number((document.getElementById(`edit-remaining-${debt.id}`) as HTMLInputElement).value);
                                    
                                    const updates: Partial<Debt> = { 
                                      creditor, 
                                      dueDate: date, 
                                      totalAmount: total, 
                                      remainingAmount: remaining, 
                                      status: (remaining <= 0 ? 'paid' : 'pending') as 'paid' | 'pending' 
                                    };
                                    
                                    if (debt.installmentInfo || debt.recurringGroupId) {
                                      if (window.confirm("Deseja aplicar estas alterações a esta e todas as parcelas FUTURAS?")) {
                                        updateDebtSmart(debt.id, updates, true);
                                      } else {
                                        updateDebtSmart(debt.id, updates, false);
                                      }
                                    } else {
                                      updateDebtSmart(debt.id, updates, false);
                                    }
                                    setEditingDebtId(null);
                                  }}
                                  className="flex-1 sm:flex-none bg-[#16A34A] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-200 hover:bg-[#15803D]"
                                >
                                  Salvar
                                </button>
                                <button 
                                  onClick={() => setEditingDebtId(null)}
                                  className="flex-1 sm:flex-none bg-white border border-[#E2E8F0] text-[#64748B] px-6 py-2.5 rounded-xl text-[10px] font-black uppercase"
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}

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
                              className="p-2.5 text-[#94A3B8] hover:text-[#DC2626] transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            
                            {(debt.installmentInfo || debt.recurringGroupId) && (
                              <button 
                                onClick={() => deleteSeries(debt.installmentInfo?.groupId || debt.recurringGroupId!)}
                                className="text-[9px] font-black text-[#94A3B8] border border-[#E2E8F0] px-3 py-1.5 underline rounded-lg hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-all"
                              >
                                Limpar Série
                              </button>
                            )}

                            {!isEditing && debt.status !== 'paid' && (
                              <button 
                                onClick={() => updateDebt(debt.id, { status: 'on_hold' })}
                                className="text-[9px] font-black text-[#F59E0B] border border-[#FEF3C7] px-3 py-1.5 rounded-lg hover:bg-[#FFFBEB]"
                              >
                                Espera
                              </button>
                            )}

                            {debt.type === 'fixed' && !debt.isCancelled && (
                              <button 
                                onClick={() => {
                                  if (window.confirm('Deseja encerrar a recorrência? Todas as parcelas APÓS esta serão removidas.')) {
                                    deleteDebt(debt.id, true, true);
                                    updateDebt(debt.id, { isCancelled: true });
                                  }
                                }}
                                className="text-[9px] font-black text-[#E11D48] border border-dashed border-[#FECDD3] px-3 py-1.5 rounded-lg hover:bg-[#FFF1F2]"
                              >
                                Finalizar
                              </button>
                            )}
                          </div>

                          {debt.status !== 'paid' && !isEditing && (
                            <div className="flex items-center gap-2 bg-[#F8FAFC] p-2 rounded-2xl border border-[#F1F5F9] w-full sm:w-auto">
                              <select 
                                id={`manage-pay-account-${debt.id}`}
                                className="bg-transparent text-[10px] font-black uppercase outline-none px-1 flex-1 sm:flex-none"
                              >
                                {bankAccounts.map(ba => <option key={ba.id} value={ba.id}>{ba.name}</option>)}
                              </select>
                              <input
                                id={`manage-pay-input-${debt.id}`}
                                type="number"
                                defaultValue={debt.remainingAmount}
                                className="w-20 bg-white border border-[#E2E8F0] px-3 py-2 rounded-xl text-xs font-black text-[#2563EB] outline-none"
                              />
                              <button
                                onClick={() => {
                                  const input = document.getElementById(`manage-pay-input-${debt.id}`) as HTMLInputElement;
                                  const select = document.getElementById(`manage-pay-account-${debt.id}`) as HTMLSelectElement;
                                  const val = Number(input.value);
                                  if (val > 0) {
                                    registerPayment(debt.id, val, select.value);
                                  }
                                }}
                                className="bg-[#1E293B] text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-black transition-all"
                              >
                                Pagar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'negotiations' && (
            <motion.div
              key="negotiations"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-[#1E293B]">Plano de Quitação</h2>
                <p className="text-sm text-[#64748B]">Dívidas em negociação ou aguardando decisão. Não somam no total mensal.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {debts.filter(d => d.status === 'on_hold').map((debt) => (
                  <div key={debt.id} className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm hover:border-[#F59E0B]/30 transition-all">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <h3 className="font-black text-xl text-[#1E293B] tracking-tight">{debt.creditor}</h3>
                          <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-black uppercase px-2 py-1 rounded-md">Em Espera</span>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest">Anotações / Proposta de Acordo</label>
                          <textarea 
                            className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#F59E0B] min-h-[80px] resize-none"
                            placeholder="Anote aqui detalhes da negociação, propostas recebidas..."
                            defaultValue={debt.notes || ''}
                            onBlur={(e) => updateDebt(debt.id, { notes: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col md:items-end justify-between gap-4">
                        <div className="text-right">
                          <label className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest block mb-1">Valor Total</label>
                          <p className="text-3xl font-black text-[#F59E0B] tracking-tighter">{formatCurrency(debt.remainingAmount)}</p>
                        </div>

                        <div className="flex flex-col gap-2 items-end">
                          <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest">Ativar para Pagamento</label>
                          <div className="flex items-center gap-2 bg-[#F1F5F9] p-1.5 rounded-xl border border-[#E2E8F0]">
                             <button 
                              onClick={() => {
                                if (window.confirm(`Deseja mover "${debt.creditor}" para Pendente?`)) {
                                  updateDebt(debt.id, { status: 'pending' });
                                }
                              }}
                              className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-[#1D4ED8] transition-all"
                            >
                              Mover p/ Pendentes
                            </button>
                            <button 
                              onClick={() => {
                                if (window.confirm('Excluir definitivamente este registro?')) {
                                  deleteDebt(debt.id);
                                }
                              }}
                              className="p-2 text-[#94A3B8] hover:text-[#EF4444]"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {debts.filter(d => d.status === 'on_hold').length === 0 && (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-[#E2E8F0]">
                    <History className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
                    <p className="text-[#64748B] font-medium">Nenhuma dívida no plano de quitação.</p>
                    <p className="text-xs text-[#94A3B8] mt-1">Coloque dívidas "Em Espera" na aba de Proventos para negociá-las aqui.</p>
                  </div>
                )}
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
