import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { PlusCircle, CreditCard as CreditCardIcon, History, Trash2, Download, Upload, Share2, Home, Receipt, Hammer, Plus, X, ListTodo, Wallet, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Debt, CreditCard, DebtPayment } from './types';

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
      { id: 'cc-1', name: 'Sicoob', limit: 1600, availableLimit: 1600, closingDay: 1, dueDay: 11, color: '#16A34A' },
      { id: 'cc-2', name: 'Mercado Pago', limit: 500, availableLimit: 500, closingDay: 5, dueDay: 10, color: '#2563EB' },
      { id: 'cc-3', name: 'Nubank', limit: 200, availableLimit: 200, closingDay: 12, dueDay: 20, color: '#9333EA' }
    ];
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'debts' | 'cards' | 'negotiations' | 'work-summary'>('dashboard');
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [showCardManager, setShowCardManager] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTab, setQuickAddTab] = useState<'transaction' | 'debt'>('transaction');
  const [debtSubTab, setDebtSubTab] = useState<'current' | 'old'>('current');
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');
  const [debtStatusFilter, setDebtStatusFilter] = useState<'all' | 'pending' | 'paid' | 'negotiate'>('all');

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

  // Calculations
  const metrics = useMemo(() => {
    const totalLimit = cards.reduce((acc, c) => acc + c.limit, 0);
    const totalAvailable = cards.reduce((acc, c) => acc + c.availableLimit, 0);
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDebt = debts
      .filter(d => {
        if (d.status === 'on_hold') return false;
        if (d.category === 'A Negociar') return false;
        if (!d.dueDate) return false;
        const [dYear, dMonth] = d.dueDate.split('-').map(Number);
        return dYear === year && dMonth === month;
      })
      .reduce((acc, d) => acc + d.remainingAmount, 0);

    const totalWorkExpensesCurrentMonth = transactions
      .filter(t => {
        if (!t.isWorkExpense) return false;
        const [tYear, tMonth] = t.date.split('-').map(Number);
        return tYear === year && tMonth === month;
      })
      .reduce((acc, t) => acc + t.amount, 0);

    const totalWorkDebtsCurrentMonth = debts
      .filter(d => {
        if (!d.isWorkExpense || d.status === 'on_hold' || d.category === 'A Negociar') return false;
        if (!d.dueDate) return false;
        const [dYear, dMonth] = d.dueDate.split('-').map(Number);
        return dYear === year && dMonth === month;
      })
      .reduce((acc, d) => acc + d.remainingAmount, 0);
      
    return { totalLimit, totalAvailable, totalDebt, totalWork: totalWorkExpensesCurrentMonth + totalWorkDebtsCurrentMonth };
  }, [cards, debts, transactions, selectedMonth]);

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
  const addTransaction = (t: Omit<Transaction, 'id'>, cardId?: string) => {
    const id = crypto.randomUUID();
    const newTransaction: Transaction = { id, ...t, cardId };

    // Limit validation and subtraction for Credit Cards
    if (cardId && t.type === 'expense') {
      const card = cards.find(c => c.id === cardId);
      if (card) {
        if (t.amount > card.availableLimit) {
          alert(`Limite insuficiente no cartão ${card.name}! Disponível: ${formatCurrency(card.availableLimit)}`);
          return;
        }
        
        // Subtract from available limit
        setCards(cards.map(c => c.id === cardId ? { ...c, availableLimit: Number((c.availableLimit - t.amount).toFixed(2)) } : c));
        handleCardInvoiceAutoDebt(t.amount, t.date, cardId);
      }
    }

    setTransactions([newTransaction, ...transactions]);
    setIsAddingTransaction(false);
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
        cardId, // Ensure it's linked
        totalAmount: Number((updatedDebts[existingDebtIndex].totalAmount + amount).toFixed(2)),
        remainingAmount: Number((updatedDebts[existingDebtIndex].remainingAmount + amount).toFixed(2))
      };
      setDebts(updatedDebts);
    } else {
      const newDebt: Debt = {
        id: crypto.randomUUID(),
        cardId, // Link the card
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
      const baseAmount = Math.floor((d.totalAmount / installments) * 100) / 100;
      const remainder = Number((d.totalAmount - (baseAmount * installments)).toFixed(2));
      
      for (let i = 1; i <= installments; i++) {
        const dueDate = getNextMonthDate(d.dueDate, i - 1);
        const currentAmount = i === installments ? Number((baseAmount + remainder).toFixed(2)) : baseAmount;
        
        newDebts.push({
          ...d,
          id: crypto.randomUUID(),
          totalAmount: currentAmount,
          remainingAmount: currentAmount,
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

  const registerPayment = (debtId: string, amount: number, interest: number = 0) => {
    const debt = debts.find((d) => d.id === debtId);
    if (!debt) return;

    const paymentAmount = Math.min(amount, debt.remainingAmount);
    const totalPaid = Number((paymentAmount + interest).toFixed(2));
    
    const newPayment: DebtPayment = {
      id: crypto.randomUUID(),
      amount: paymentAmount,
      date: new Date().toISOString().split('T')[0],
      interest: interest > 0 ? interest : undefined
    };

    const remaining = Number((debt.remainingAmount - paymentAmount).toFixed(2));
    
    // Restore card limit if paying a card invoice
    if (debt.cardId && debt.category !== 'A Negociar') {
      setCards(cards => cards.map(c => c.id === debt.cardId ? { 
        ...c, 
        availableLimit: Number((c.availableLimit + totalPaid).toFixed(2)) 
      } : c));
    }

    setDebts(debts.map(d => d.id === debtId ? {
      ...d,
      remainingAmount: remaining,
      status: remaining <= 0 ? 'paid' : d.status,
      payments: [...(d.payments || []), newPayment]
    } : d));

    addTransaction({
      amount: totalPaid,
      type: 'expense',
      category: 'Dívida',
      date: new Date().toISOString().split('T')[0],
      description: `Pagamento: ${debt.creditor} ${debt.installmentInfo ? `(${debt.installmentInfo.current}/${debt.installmentInfo.total})` : ''}${interest > 0 ? ` (Inc. Juros: ${formatCurrency(interest)})` : ''}`,
      isWorkExpense: debt.isWorkExpense
    });
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

    if (updates.totalAmount !== undefined && updates.totalAmount !== target.totalAmount && target.installmentInfo) {
      const gid = target.installmentInfo.groupId;
      const groupDebts = debts.filter(d => d.installmentInfo?.groupId === gid).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      
      const previousTotal = groupDebts.reduce((acc, d) => acc + d.totalAmount, 0);
      const otherDebts = groupDebts.filter(d => d.id !== id);
      
      if (otherDebts.length > 0) {
        const remainingToDistribute = Number((previousTotal - updates.totalAmount).toFixed(2));
        const count = otherDebts.length;
        const baseAmount = Math.max(0, Math.floor((remainingToDistribute / count) * 100) / 100);
        const remainder = Number((remainingToDistribute - (baseAmount * count)).toFixed(2));

        setDebts(currentDebts => currentDebts.map(d => {
          if (d.id === id) {
            return { ...d, ...updates };
          }
          if (d.installmentInfo?.groupId === gid) {
            const indexInOthers = otherDebts.findIndex(od => od.id === d.id);
            if (indexInOthers !== -1) {
              const isLast = indexInOthers === otherDebts.length - 1;
              const newAmount = isLast ? Number((baseAmount + remainder).toFixed(2)) : baseAmount;
              const newRemaining = d.status === 'paid' ? 0 : newAmount;
              return { ...d, totalAmount: newAmount, remainingAmount: newRemaining };
            }
          }
          return d;
        }));
        return;
      }
    }

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

  const deleteTransaction = (id: string) => {
    const t = transactions.find(tr => tr.id === id);
    if (!t) return;

    // If it was a card transaction, restore limit and reduce invoice debt
    if (t.cardId && t.type === 'expense') {
      const card = cards.find(c => c.id === t.cardId);
      if (card) {
        // Restore available limit
        setCards(cards.map(c => c.id === t.cardId ? { 
          ...c, 
          availableLimit: Number((c.availableLimit + t.amount).toFixed(2)) 
        } : c));

        // Find and reduce invoice debt
        const [pYear, pMonth, pDay] = t.date.split('-').map(Number);
        let tYear = pYear;
        let tMonth = pMonth - 1;
        if (pDay > card.closingDay) tMonth++;
        const targetDate = new Date(tYear, tMonth, card.dueDay);
        const monthYearLabel = targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const creditorName = `Fatura: ${card.name} (${monthYearLabel})`;

        setDebts(currentDebts => currentDebts.map(d => {
          if (d.creditor === creditorName && d.status !== 'paid') {
            const newTotal = Number((d.totalAmount - t.amount).toFixed(2));
            const newRemaining = Number((d.remainingAmount - t.amount).toFixed(2));
            return {
              ...d,
              totalAmount: newTotal,
              remainingAmount: newRemaining,
              status: newRemaining <= 0 ? 'paid' : d.status
            };
          }
          return d;
        }));
      }
    }
    
    setTransactions(transactions.filter(tr => tr.id !== id));
  };
  const updateTransaction = (id: string, updates: Partial<Transaction>) => setTransactions(transactions.map(t => t.id === id ? { ...t, ...updates } : t));
  const updateDebt = (id: string, updates: Partial<Debt>) => setDebts(debts.map(d => d.id === id ? { ...d, ...updates } : d));
  
  const updateCard = (id: string, updates: Partial<CreditCard>) => setCards(cards.map(c => c.id === id ? { ...c, ...updates } : c));

  const exportBackup = () => {
    const backupData = {
      transactions,
      debts,
      cards,
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
        if (!data.transactions || !data.debts || !data.cards) {
          throw new Error('Arquivo de backup inválido');
        }
        setTransactions(data.transactions);
        setDebts(data.debts);
        setCards(data.cards);
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

  const generatePeriodReport = () => {
    let filteredDebts = [];
    let periodTitle = "";
    
    // Check if the status filter is 'negotiate' OR subtab is 'old'
    if (debtStatusFilter === 'negotiate' || debtSubTab === 'old') {
      // Dívidas Antigas Isoladas: ignore dates, list only A Negociar category
      filteredDebts = debts.filter(d => {
        if (d.status === 'on_hold') return false;
        return d.category === 'A Negociar';
      });
      periodTitle = "Dívidas Antigas ('A Negociar') - Sem limite de data";
    } else {
      // Normal period flow (current debts)
      if (reportStartDate || reportEndDate) {
        filteredDebts = debts.filter(d => {
          if (d.status === 'on_hold') return false;
          if (d.category === 'A Negociar') return false;
          if (!d.dueDate) return false;
          if (reportStartDate && d.dueDate < reportStartDate) return false;
          if (reportEndDate && d.dueDate > reportEndDate) return false;
          return true;
        });
        
        const startFormatted = reportStartDate ? formatDate(reportStartDate) : 'Início';
        const endFormatted = reportEndDate ? formatDate(reportEndDate) : 'Fim';
        periodTitle = `${startFormatted} até ${endFormatted}`;
      } else {
        // Fallback to active month selection
        filteredDebts = debts.filter(d => {
          if (d.status === 'on_hold') return false;
          if (d.category === 'A Negociar') return false;
          if (!d.dueDate) return false;
          const [y, m] = d.dueDate.split('-').map(Number);
          const [selY, selM] = selectedMonth.split('-').map(Number);
          return y === selY && m === selM;
        });
        
        const [selY, selM] = selectedMonth.split('-').map(Number);
        const months = [
          'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        periodTitle = `${months[selM - 1]} de ${selY}`;
      }

      // Filter based on the selected status button (respect the active selection)
      if (debtStatusFilter === 'pending') {
        filteredDebts = filteredDebts.filter(d => d.status === 'pending');
      } else if (debtStatusFilter === 'paid') {
        filteredDebts = filteredDebts.filter(d => d.status === 'paid');
      }
    }

    if (filteredDebts.length === 0) {
      alert("Nenhuma conta encontrada para o filtro/período selecionado!");
      return;
    }

    let filterLabel = "TUDO";
    if (debtStatusFilter === 'pending') filterLabel = "🔴 A PAGAR (PENDENTES/VENCIDOS)";
    if (debtStatusFilter === 'paid') filterLabel = "🟢 PAGO";
    if (debtStatusFilter === 'negotiate' || debtSubTab === 'old') filterLabel = "📁 A NEGOCIAR";

    let reportText = `*RELATÓRIO DE CONTAS - PERÍODO: ${periodTitle.toUpperCase()}*\n`;
    reportText += `Filtro selecionado: *${filterLabel}*\n\n`;
    
    let totalPaid = 0;
    let totalPending = 0;

    filteredDebts.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).forEach(d => {
      const today = new Date().toISOString().split('T')[0];
      const isOverdue = d.status === 'pending' && d.dueDate && d.dueDate < today;
      let statusLabel = "";
      if (d.status === 'paid') {
        statusLabel = "🟢 Pago";
      } else if (isOverdue) {
        statusLabel = "🔴 Vencido";
      } else {
        statusLabel = "🟡 Pendente";
      }

      const billPaid = d.totalAmount - d.remainingAmount;
      const billPending = d.remainingAmount;
      totalPaid += billPaid;
      totalPending += billPending;

      reportText += `📅 [${d.dueDate ? formatDate(d.dueDate) : 'Sem Data'}] - *${d.creditor}*\n`;
      reportText += `💰 Total original: ${formatCurrency(d.totalAmount)} | Status: ${statusLabel}\n`;
      if (billPaid > 0 && d.status !== 'paid') {
        reportText += `   (Pago: ${formatCurrency(billPaid)} | Carência Pagar: ${formatCurrency(billPending)})\n`;
      } else {
        reportText += `   (Valor Restante: ${formatCurrency(billPending)})\n`;
      }
      reportText += `\n`;
    });

    const totalSum = totalPaid + totalPending;

    reportText += `--------------------------\n`;
    reportText += `📊 *RESUMO DO FILTRO QUE VOCÊ SELECIONOU:*\n`;
    if (debtStatusFilter === 'all' || debtStatusFilter === 'negotiate' || debtSubTab === 'old') {
      reportText += `🟢 Total Pago: ${formatCurrency(totalPaid)}\n`;
      reportText += `🔴 Total Vencido/Pendente: ${formatCurrency(totalPending)}\n`;
      reportText += `📈 *SOMA TOTAL: ${formatCurrency(totalSum)}*\n`;
    } else if (debtStatusFilter === 'pending') {
      reportText += `🔴 Total Vencido/Pendente: ${formatCurrency(totalPending)}\n`;
    } else if (debtStatusFilter === 'paid') {
      reportText += `🟢 Total Pago: ${formatCurrency(totalPaid)}\n`;
    }

    if (navigator.share) {
      navigator.share({
        title: 'Relatório de Contas',
        text: reportText,
      }).catch(err => {
        console.error("Erro ao compartilhar", err);
        navigator.clipboard.writeText(reportText).then(() => {
          alert("Relatório copiado para a área de transferência!");
        });
      });
    } else {
      navigator.clipboard.writeText(reportText).then(() => {
        alert("Relatório copiado para a área de transferência!");
      });
    }
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
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans pb-32">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Modern Mobile Greeting Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-[#E2E8F0] pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-[#1E293B] tracking-tight">Olá, Curtis 👋</h1>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-xl border border-[#E2E8F0] shadow-sm shrink-0">
                <button 
                  onClick={exportBackup}
                  className="p-1 text-[#64748B] hover:text-[#2563EB] transition-colors"
                  title="Exportar Backup"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-3 bg-[#CBD5E1]"></div>
                <label className="p-1 text-[#64748B] hover:text-[#2563EB] transition-colors cursor-pointer" title="Importar Backup">
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept=".json" onChange={importBackup} className="hidden" />
                </label>
              </div>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-0.5">Visão unificada das suas finanças e obras.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => setShowCardManager(!showCardManager)}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-[#E2E8F0] text-[#1E293B] rounded-xl text-xs font-bold uppercase transition-all shadow-sm flex items-center justify-center gap-2 shrink-0"
              title="Gerenciar Cartões"
            >
              <CreditCardIcon className="w-4 h-4 text-[#2563EB]" /> Cartões
            </button>
            <div className="bg-[#FFF1F2] border border-[#FEE2E2] px-4 py-3 rounded-2xl flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              <span className="text-[10px] font-black text-[#E11D48] uppercase tracking-wider">Total Devido no Mês</span>
              <p className="text-xl font-black text-[#E11D48]">{formatCurrency(metrics.totalDebt)}</p>
            </div>
          </div>
        </div>

        {/* Sub-tabs segment control for Início sub-tabs */}
        {['dashboard', 'transactions', 'cards', 'negotiations'].includes(activeTab) && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar bg-slate-100 p-1 rounded-2xl mb-6 shadow-inner border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center ${activeTab === 'dashboard' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B] hover:text-[#1E293B]'}`}
            >
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center ${activeTab === 'transactions' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B] hover:text-[#1E293B]'}`}
            >
              Extrato
            </button>
            <button
              onClick={() => setActiveTab('cards')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center ${activeTab === 'cards' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B] hover:text-[#1E293B]'}`}
            >
              Cartões
            </button>
            <button
              onClick={() => setActiveTab('negotiations')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center ${activeTab === 'negotiations' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B] hover:text-[#1E293B]'}`}
            >
              Espera / Acordos
            </button>
          </div>
        )}
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
                  <p className="text-[9px] md:text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1 md:mb-2 text-center md:text-left">Limite Disponível</p>
                  <p className={`text-xl md:text-3xl font-bold text-center md:text-left ${metrics.totalAvailable > 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {formatCurrency(metrics.totalAvailable)}
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
                      onClick={() => { setQuickAddTab('transaction'); setShowQuickAdd(true); }}
                      className="w-full bg-[#2563EB] text-white py-2.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wide hover:bg-[#1D4ED8]"
                    >
                      + Novo Gasto
                    </button>
                    <button 
                      onClick={() => { setQuickAddTab('debt'); setShowQuickAdd(true); }}
                      className="w-full bg-[#1E293B] text-white py-2.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-wide hover:bg-black"
                    >
                      + Nova Dívida
                    </button>
                  </div>
                </div>
                <div className="bg-white p-4 md:p-5 rounded-xl border border-[#E2E8F0] shadow-sm col-span-2 md:col-span-1">
                  <p className="text-[9px] md:text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1 md:mb-2 text-center md:text-left">Total da Obra (Mês)</p>
                  <p className="text-xl md:text-3xl font-bold text-[#2563EB] text-center md:text-left">
                    {formatCurrency(metrics.totalWork)}
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
                          if (d.status === 'paid' || d.status === 'on_hold' || d.category === 'A Negociar') return false;
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
                                  inputMode="decimal"
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
                              <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col">
                                    <label className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-tighter">Valor</label>
                                    <input 
                                      id={`desktop-pay-input-${debt.id}`}
                                      type="number"
                                      step="0.01"
                                      inputMode="decimal"
                                      className="w-20 text-xs font-bold text-[#2563EB] bg-[#F1F5F9] border border-[#E2E8F0] p-1.5 rounded outline-none"
                                      defaultValue={debt.remainingAmount}
                                    />
                                  </div>
                                  <div className="flex flex-col">
                                    <label className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-tighter">Juros</label>
                                    <input 
                                      id={`desktop-pay-interest-${debt.id}`}
                                      type="number"
                                      step="0.01"
                                      inputMode="decimal"
                                      placeholder="0,00"
                                      className="w-16 text-xs font-bold text-[#E11D48] bg-[#F1F5F9] border border-[#E2E8F0] p-1.5 rounded outline-none"
                                    />
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const input = document.getElementById(`desktop-pay-input-${debt.id}`) as HTMLInputElement;
                                      const interestInput = document.getElementById(`desktop-pay-interest-${debt.id}`) as HTMLInputElement;
                                      const val = Number(input.value);
                                      const interest = Number(interestInput.value || 0);
                                      if (val > 0 || interest > 0) {
                                        registerPayment(debt.id, val, interest);
                                      }
                                    }}
                                    className="bg-[#2563EB] text-white px-4 py-1.5 rounded-lg text-[10px] font-bold hover:bg-[#1D4ED8] shadow-sm transform active:scale-95 transition-all self-end h-[32px]"
                                  >
                                    Pagar
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile Card List */}
                    <div className="md:hidden divide-y divide-[#F1F5F9]">
                      {debts.filter(d => {
                        if (d.status === 'paid' || d.status === 'on_hold' || d.category === 'A Negociar') return false;
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
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center gap-2 bg-[#F8FAFC] p-2 rounded-2xl border border-[#E2E8F0] w-full">
                                <div className="flex flex-col flex-1">
                                  <label className="text-[8px] font-black text-[#94A3B8] uppercase px-1">Valor</label>
                                  <input
                                    id={`dashboard-pay-input-${debt.id}`}
                                    type="number"
                                    step="0.01"
                                    inputMode="decimal"
                                    defaultValue={debt.remainingAmount}
                                    className="w-full bg-white border border-[#E2E8F0] px-3 py-2 rounded-xl text-xs font-black text-[#2563EB] outline-none"
                                  />
                                </div>
                                <div className="flex flex-col flex-1">
                                  <label className="text-[8px] font-black text-[#94A3B8] uppercase px-1">Juros</label>
                                  <input
                                    id={`dashboard-pay-interest-${debt.id}`}
                                    type="number"
                                    step="0.01"
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    className="w-full bg-white border border-[#E2E8F0] px-3 py-2 rounded-xl text-xs font-black text-[#E11D48] outline-none"
                                  />
                                </div>
                            </div>
                            <button
                              onClick={() => {
                                const input = document.getElementById(`dashboard-pay-input-${debt.id}`) as HTMLInputElement;
                                const interestInput = document.getElementById(`dashboard-pay-interest-${debt.id}`) as HTMLInputElement;
                                const val = Number(input.value);
                                const interest = Number(interestInput.value || 0);
                                if (val > 0 || interest > 0) {
                                  registerPayment(debt.id, val, interest);
                                }
                              }}
                              className="w-full bg-[#2563EB] text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider"
                            >
                              Confirmar Pagamento
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {debts.filter(d => {
                      if (d.status === 'paid' || d.status === 'on_hold' || d.category === 'A Negociar') return false;
                      const [y, m] = d.dueDate.split('-').map(Number);
                      const [selY, selM] = selectedMonth.split('-').map(Number);
                      return y === selY && m === selM;
                    }).length === 0 && (
                      <div className="px-5 py-12 text-center text-[#94A3B8] font-medium text-xs italic">
                        Não há pagamentos pendentes selecionados.
                      </div>
                    )}
                  </div>
                </div>

                {/* Bank status (Span 4) */}
                <div className="md:col-span-4 space-y-4">
                  {cards.map(card => {
                    const usagePercent = Math.min(100, ((card.limit - card.availableLimit) / card.limit) * 100);
                    
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
                            <p className="text-lg font-black text-[#1E293B]">{formatCurrency(card.limit - card.availableLimit)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#94A3B8] uppercase text-right">Disponível</p>
                            <p className="text-sm font-bold text-[#16A34A]">{formatCurrency(card.availableLimit)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                              <p className="text-lg font-black text-[#E11D48]">{formatCurrency(card.limit - card.availableLimit)}</p>
                            </div>
                            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#F1F5F9]">
                              <p className="text-[9px] font-bold text-[#94A3B8] uppercase">Limite Disp.</p>
                              <p className="text-lg font-black text-[#16A34A]">{formatCurrency(card.availableLimit)}</p>
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
                  onClick={() => { setQuickAddTab('transaction'); setShowQuickAdd(true); }}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                >
                  <PlusCircle className="w-4 h-4" /> Nova Transação
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
                      type: 'expense',
                      category: fd.get('category') as string,
                      date: fd.get('date') as string,
                      isWorkExpense: fd.get('isWorkExpense') === 'on'
                    }, type === 'cc' ? id : undefined);
                  }} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Descrição</label>
                      <input name="description" required placeholder="Salário, Jantar..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Valor (R$)</label>
                      <input name="amount" type="number" step="0.01" inputMode="decimal" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Tipo</label>
                      <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg h-full">
                        <input type="checkbox" name="isWorkExpense" id="isWorkExpense" className="w-4 h-4 accent-[#2563EB]" />
                        <label htmlFor="isWorkExpense" className="text-xs font-bold text-[#1E293B]">Gasto da Obra</label>
                      </div>
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
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Método de Pagamento</label>
                      <select name="method" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        <optgroup label="Usar Cartão (Fatura)">
                          {cards.map(card => (
                            <option key={card.id} value={`cc:${card.id}`}>{card.name} (Disp: {formatCurrency(card.availableLimit)})</option>
                          ))}
                        </optgroup>
                        <option value="other:direct">Dinheiro / Pix Direto</option>
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
                            {t.isWorkExpense && (
                              <span className="bg-[#DBEAFE] text-[#1E40AF] text-[8px] font-black uppercase px-1.5 py-0.5 rounded">Obra</span>
                            )}
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
                              inputMode="decimal"
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
                          <div className="flex items-center gap-2">
                            <input 
                              className="font-bold text-sm bg-transparent outline-none focus:text-[#2563EB] w-full truncate"
                              value={t.description}
                              onChange={(e) => updateTransaction(t.id, { description: e.target.value })}
                            />
                            {t.isWorkExpense && (
                              <span className="bg-[#DBEAFE] text-[#1E40AF] text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0">Obra</span>
                            )}
                          </div>
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
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  <button 
                    onClick={generatePeriodReport}
                    className="flex-1 md:flex-none bg-[#E11D48] text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase hover:bg-[#BE123C] shadow-sm transform active:scale-95 transition-all"
                  >
                    <Share2 className="w-4 h-4" /> Gerar Relatório para Compartilhar
                  </button>
                  <button 
                    onClick={cleanupDuplicates}
                    className="flex-1 md:flex-none px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-xs font-bold uppercase hover:bg-[#F1F5F9] transition-all"
                  >
                    Limpar Duplicatas
                  </button>
                  <button
                    id="btn-add-debt-view"
                    onClick={() => { setQuickAddTab('debt'); setShowQuickAdd(true); }}
                    className="flex-1 md:flex-none bg-[#2563EB] text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-[#1D4ED8]"
                  >
                    <PlusCircle className="w-4 h-4" /> Nova Dívida
                  </button>
                </div>
              </div>

              {/* Sub-tabs segment control for debts */}
              <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl mb-4 shadow-inner border border-slate-200">
                <button
                  onClick={() => {
                    setDebtSubTab('current');
                    if (debtStatusFilter === 'negotiate') {
                      setDebtStatusFilter('all');
                    }
                  }}
                  className={`flex-1 py-3 px-4 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center gap-2 cursor-pointer ${debtSubTab === 'current' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                >
                  Contas do Mês
                </button>
                <button
                  onClick={() => {
                    setDebtSubTab('old');
                    setDebtStatusFilter('negotiate');
                  }}
                  className={`flex-1 py-3 px-4 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center gap-2 cursor-pointer ${debtSubTab === 'old' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                >
                  Dívidas Antigas ('A Negociar')
                  {debts.filter(d => d.category === 'A Negociar' && d.status !== 'paid').length > 0 && (
                    <span className="bg-[#E11D48] text-white text-[9px] font-black px-2 py-0.5 rounded-full shrink-0">
                      {debts.filter(d => d.category === 'A Negociar' && d.status !== 'paid').length}
                    </span>
                  )}
                </button>
              </div>

              {/* Date & Status Filters & Reporting Panel */}
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    📅 Filtros e Compartilhamento de Contas
                  </h3>
                  {(reportStartDate || reportEndDate || debtStatusFilter !== 'all') && (
                    <button 
                      onClick={() => {
                        setReportStartDate('');
                        setReportEndDate('');
                        setDebtStatusFilter('all');
                        setDebtSubTab('current');
                      }}
                      className="text-[10px] font-black text-[#E11D48] bg-[#FFF1F2] border border-[#FEE2E2] px-2.5 py-1 rounded-lg hover:bg-[#FECDD3] transition-colors uppercase cursor-pointer"
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  {/* Start Date */}
                  <div className={`sm:col-span-4 space-y-1 transition-all ${(debtStatusFilter === 'negotiate' || debtSubTab === 'old') ? 'opacity-40 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block pl-0.5">De:</label>
                    <input 
                      type="date" 
                      value={reportStartDate} 
                      onChange={(e) => setReportStartDate(e.target.value)}
                      disabled={debtStatusFilter === 'negotiate' || debtSubTab === 'old'}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  {/* End Date */}
                  <div className={`sm:col-span-4 space-y-1 transition-all ${(debtStatusFilter === 'negotiate' || debtSubTab === 'old') ? 'opacity-40 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block pl-0.5">Até:</label>
                    <input 
                      type="date" 
                      value={reportEndDate} 
                      onChange={(e) => setReportEndDate(e.target.value)}
                      disabled={debtStatusFilter === 'negotiate' || debtSubTab === 'old'}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-700 p-2.5 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  {/* Share Button updated */}
                  <div className="sm:col-span-4">
                    <button
                      onClick={generatePeriodReport}
                      className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white p-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase shadow-sm transition-all transform active:scale-95 cursor-pointer"
                      title="Gerar Relatório para Compartilhar"
                    >
                      <Share2 className="w-4 h-4" /> Relatório p/ Compartilhar
                    </button>
                  </div>
                </div>

                {/* Status Selection Buttons (Botões de Seleção Rápida) */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5 pl-0.5">Visualizar Status no Período:</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setDebtStatusFilter('all');
                        setDebtSubTab('current');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        debtStatusFilter === 'all' && debtSubTab === 'current'
                          ? 'bg-slate-800 text-white shadow-xs scale-102 ring-2 ring-slate-800/10'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      🔘 Tudo
                    </button>
                    <button
                      onClick={() => {
                        setDebtStatusFilter('pending');
                        setDebtSubTab('current');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        debtStatusFilter === 'pending'
                          ? 'bg-[#EF4444] text-white shadow-xs scale-102 ring-2 ring-red-500/10'
                          : 'bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#B91C1C]'
                      }`}
                    >
                      🔴 A Pagar
                    </button>
                    <button
                      onClick={() => {
                        setDebtStatusFilter('paid');
                        setDebtSubTab('current');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        debtStatusFilter === 'paid'
                          ? 'bg-[#10B981] text-white shadow-xs scale-102 ring-2 ring-emerald-500/10'
                          : 'bg-[#D1FAE5] hover:bg-[#6EE7B7] text-[#065F46]'
                      }`}
                    >
                      🟢 Pago
                    </button>
                    <button
                      onClick={() => {
                        setDebtStatusFilter('negotiate');
                        setDebtSubTab('old');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        debtStatusFilter === 'negotiate' || debtSubTab === 'old'
                          ? 'bg-[#E11D48] text-white shadow-xs scale-102 ring-2 ring-rose-500/10'
                          : 'bg-[#FFE4E6] hover:bg-[#FECDD3] text-[#BE123C]'
                      }`}
                    >
                      📁 A Negociar
                    </button>
                  </div>
                </div>

                {/* Tiny Active Status Indicator */}
                <div className="bg-blue-50/70 border border-blue-100 text-[11px] text-blue-800 font-bold px-3 py-2 rounded-xl flex items-center justify-between flex-wrap gap-2">
                  <span>
                    {debtStatusFilter === 'negotiate' || debtSubTab === 'old' ? (
                      <span>📂 Vendo apenas <strong className="font-extrabold text-[#BE123C]">Dívidas Antigas ('A Negociar')</strong>. Datas ignoradas.</span>
                    ) : (
                      <span>
                        🔍 Período: <strong className="font-extrabold">{reportStartDate ? formatDate(reportStartDate) : 'Mínimo'}</strong> ao <strong className="font-extrabold">{reportEndDate ? formatDate(reportEndDate) : 'Máximo'}</strong>
                        {debtStatusFilter === 'pending' && <span className="text-[#B91C1C] font-extrabold"> • Apenas Pendentes/Vencidos</span>}
                        {debtStatusFilter === 'paid' && <span className="text-[#065F46] font-extrabold"> • Apenas Quitados</span>}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-black text-blue-900 bg-white/80 px-2 py-0.5 rounded-md shrink-0">
                    {debts.filter(d => {
                      if (d.status === 'on_hold') return false;
                      if (debtStatusFilter === 'negotiate' || debtSubTab === 'old') {
                        return d.category === 'A Negociar';
                      }
                      if (d.category === 'A Negociar') return false;
                      if (debtStatusFilter === 'pending' && d.status !== 'pending') return false;
                      if (debtStatusFilter === 'paid' && d.status !== 'paid') return false;
                      
                      if (reportStartDate || reportEndDate) {
                        if (!d.dueDate) return false;
                        if (reportStartDate && d.dueDate < reportStartDate) return false;
                        if (reportEndDate && d.dueDate > reportEndDate) return false;
                        return true;
                      }
                      
                      if (!d.dueDate) return false;
                      const [y, m] = d.dueDate.split('-').map(Number);
                      const [selY, selM] = selectedMonth.split('-').map(Number);
                      return y === selY && m === selM;
                    }).length} contas
                  </span>
                </div>
              </div>

              {/* Old debts top banner summary */}
              {debtSubTab === 'old' && (
                <div className="bg-[#FFF1F2] border border-[#FEE2E2] p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                  <div>
                    <h4 className="font-black text-sm text-[#E11D48] uppercase tracking-wider">Total de Dívidas Antigas a Negociar</h4>
                    <p className="text-xs text-[#64748B] mt-0.5 font-medium">Estes lançamentos estão isolados do seu limite de cartão de crédito e do orçamento mensal regular.</p>
                  </div>
                  <p className="text-3xl font-black text-[#E11D48] tracking-tight">
                    {formatCurrency(debts.filter(d => d.category === 'A Negociar' && d.status !== 'paid').reduce((sum, d) => sum + d.remainingAmount, 0))}
                  </p>
                </div>
              )}

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
                      type,
                      category: fd.get('category') as string,
                      isWorkExpense: fd.get('isWorkExpense') === 'on'
                    }, installments);
                  }} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Credor / Descrição</label>
                      <input name="creditor" required placeholder="Aluguel, Internet, Compra Loja..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Valor {activeTab === 'debts' ? 'Total' : ''} (R$)</label>
                      <input name="amount" type="number" step="0.01" inputMode="decimal" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]" />
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
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase block mb-1">Categoria de Dívida</label>
                      <select name="category" required defaultValue={debtSubTab === 'old' ? 'A Negociar' : 'Dívida Geral'} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-[#2563EB]">
                        <option value="Dívida Geral">Dívida Geral</option>
                        <option value="A Negociar">A Negociar (Dívidas Antigas)</option>
                        <option value="Serviços fundamentais">Serviços fundamentais (Água, Luz...)</option>
                        <option value="Assinaturas">Assinaturas / Lazer</option>
                        <option value="Outros">Outros</option>
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
                    <div className="flex items-center gap-2 pt-4">
                      <input type="checkbox" name="isWorkExpense" id="debtIsWorkExpense" className="w-4 h-4 accent-[#2563EB]" />
                      <label htmlFor="debtIsWorkExpense" className="text-xs font-bold text-[#1E293B]">Gasto da Obra</label>
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
                  
                  // If 'A Negociar' (Old debts) is requested or active, only show that category and ignore dates
                  if (debtSubTab === 'old' || debtStatusFilter === 'negotiate') {
                    return d.category === 'A Negociar';
                  }

                  // Otherwise, normal/current monthly bills:
                  // 1. Never show 'A Negociar' here
                  if (d.category === 'A Negociar') return false;

                  // 2. Filter by status if requested: 'pending' (overdue/pending) or 'paid'
                  if (debtStatusFilter === 'pending' && d.status !== 'pending') return false;
                  if (debtStatusFilter === 'paid' && d.status !== 'paid') return false;

                  // 3. Filter by selected date range if present
                  if (reportStartDate || reportEndDate) {
                    if (!d.dueDate) return false;
                    if (reportStartDate && d.dueDate < reportStartDate) return false;
                    if (reportEndDate && d.dueDate > reportEndDate) return false;
                    return true;
                  }

                  // Default fallback: current selected month selection
                  if (!d.dueDate) return false;
                  const [y, m] = d.dueDate.split('-').map(Number);
                  const [selY, selM] = selectedMonth.split('-').map(Number);
                  return y === selY && m === selM;
                }).sort((a,b) => {
                  if (debtSubTab === 'old' || debtStatusFilter === 'negotiate') {
                    if (a.status !== b.status) {
                      return a.status === 'paid' ? 1 : -1;
                    }
                  }
                  return (a.dueDate || '').localeCompare(b.dueDate || '');
                }).map((debt) => {
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
                              {debt.isWorkExpense && (
                                <span className="bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-black uppercase px-2 py-1 rounded-md">
                                  Gasto da Obra
                                </span>
                              )}
                              {debt.category && (
                                <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black uppercase px-2 py-1 rounded-md">
                                  {debt.category}
                                </span>
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
                                {debt.installmentInfo ? (
                                  <>
                                    <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest mb-1">Total da Compra (Soma)</label>
                                    <p className="text-sm font-black text-[#2563EB]">
                                      {formatCurrency(debts.filter(d => d.installmentInfo?.groupId === debt.installmentInfo?.groupId).reduce((acc, curr) => acc + curr.totalAmount, 0))}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest mb-1">Total Lançado</label>
                                    <p className="text-sm font-bold text-[#64748B]">{formatCurrency(debt.totalAmount)}</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col md:items-end gap-2">
                            <label className="text-[10px] font-black text-[#94A3B8] uppercase tracking-widest">{isEditing ? 'Original da Parcela' : 'Saldo Devedor'}</label>
                            {isEditing ? (
                              <div className="space-y-2 w-full md:w-36">
                                <input 
                                  id={`edit-total-${debt.id}`}
                                  type="number"
                                  step="0.01"
                                  inputMode="decimal"
                                  className="text-3xl font-black text-[#DC2626] bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-xl outline-none text-right w-full focus:ring-4 focus:ring-[#DC2626]/5"
                                  defaultValue={debt.totalAmount}
                                />
                                <div className="flex items-center gap-2 justify-end">
                                  <input 
                                    id={`edit-work-${debt.id}`}
                                    type="checkbox"
                                    className="w-3 h-3"
                                    defaultChecked={debt.isWorkExpense}
                                  />
                                  <label htmlFor={`edit-work-${debt.id}`} className="text-[10px] font-bold text-[#64748B] uppercase">Obra</label>
                                </div>
                              </div>
                            ) : (
                              <p className={`text-4xl font-black ${debt.status === 'paid' ? 'text-[#16A34A]' : 'text-[#DC2626]'} tracking-tighter`}>
                                {formatCurrency(debt.remainingAmount)}
                              </p>
                            )}
                          </div>
                        </div>

                        {isEditing && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
                            <div className="bg-[#FFFBEB] p-3 rounded-xl border border-[#FEF3C7]">
                              <p className="text-[10px] font-bold text-[#92400E] uppercase text-center mb-1">Saldo Atual Restante (Pagar agora)</p>
                              <input 
                                id={`edit-remaining-${debt.id}`}
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                className="w-full text-center text-xl font-black text-[#92400E] bg-transparent outline-none"
                                defaultValue={debt.remainingAmount}
                              />
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                              <p className="text-[10px] font-bold text-slate-500 uppercase text-center mb-1">Categoria da Dívida</p>
                              <select 
                                id={`edit-category-${debt.id}`}
                                className="w-full text-sm font-bold text-slate-800 bg-transparent border-none outline-none text-center cursor-pointer mt-1"
                                defaultValue={debt.category || 'Dívida Geral'}
                              >
                                <option value="Dívida Geral">Dívida Geral</option>
                                <option value="A Negociar">A Negociar</option>
                                <option value="Serviços fundamentais">Serviços fundamentais</option>
                                <option value="Assinaturas">Assinaturas</option>
                                <option value="Outros">Outros</option>
                              </select>
                            </div>
                          </div>
                        )}

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
                                    const isWorkExpense = (document.getElementById(`edit-work-${debt.id}`) as HTMLInputElement).checked;
                                    const category = (document.getElementById(`edit-category-${debt.id}`) as HTMLSelectElement).value;
                                    
                                    const updates: Partial<Debt> = { 
                                      creditor, 
                                      dueDate: date, 
                                      totalAmount: total, 
                                      remainingAmount: remaining,
                                      isWorkExpense,
                                      category,
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

                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 bg-[#F8FAFC] p-2 rounded-2xl border border-[#F1F5F9] w-full sm:w-auto">
                                <div className="flex flex-col">
                                  <label className="text-[8px] font-black text-[#94A3B8] uppercase px-1">Valor</label>
                                  <input
                                    id={`manage-pay-input-${debt.id}`}
                                    type="number"
                                    step="0.01"
                                    inputMode="decimal"
                                    defaultValue={debt.remainingAmount}
                                    className="flex-1 sm:w-28 bg-white border border-[#E2E8F0] px-3 py-2 rounded-xl text-xs font-black text-[#2563EB] outline-none"
                                  />
                                </div>
                                <div className="flex flex-col">
                                  <label className="text-[8px] font-black text-[#94A3B8] uppercase px-1">Juros</label>
                                  <input
                                    id={`manage-pay-interest-${debt.id}`}
                                    type="number"
                                    step="0.01"
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    className="flex-1 sm:w-20 bg-white border border-[#E2E8F0] px-3 py-2 rounded-xl text-xs font-black text-[#E11D48] outline-none"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    const input = document.getElementById(`manage-pay-input-${debt.id}`) as HTMLInputElement;
                                    const interestInput = document.getElementById(`manage-pay-interest-${debt.id}`) as HTMLInputElement;
                                    const val = Number(input.value);
                                    const interest = Number(interestInput.value || 0);
                                    if (val > 0 || interest > 0) {
                                      registerPayment(debt.id, val, interest);
                                    }
                                  }}
                                  className="bg-[#1E293B] text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-black transition-all h-full self-end"
                                >
                                  Pagar
                                </button>
                              </div>
                            </div>
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
                    <p className="text-xs text-[#94A3B8] mt-1">Coloque dívidas "Em Espera" para negociá-las aqui.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'work-summary' && (
            <motion.div
              key="work-summary"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="bg-[#1E293B] p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#2563EB] opacity-10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                <div className="relative z-10">
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#94A3B8] mb-2">Investimento Total na Construção</p>
                  <h2 className="text-5xl font-black tracking-tighter mb-6">
                    {formatCurrency(
                      transactions.filter(t => t.isWorkExpense).reduce((acc, t) => acc + t.amount, 0) +
                      debts.filter(d => d.isWorkExpense).reduce((acc, d) => acc + d.remainingAmount, 0)
                    )}
                  </h2>
                  <div className="grid grid-cols-2 gap-8 border-t border-white/10 pt-6">
                    <div>
                      <p className="text-[10px] font-bold text-[#94A3B8] uppercase mb-1">Pago até agora</p>
                      <p className="text-xl font-bold text-[#16A34A]">
                        {formatCurrency(transactions.filter(t => t.isWorkExpense).reduce((acc, t) => acc + t.amount, 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[#94A3B8] uppercase mb-1">A pagar (Restante)</p>
                      <p className="text-xl font-bold text-[#E11D48]">
                        {formatCurrency(debts.filter(d => d.isWorkExpense).reduce((acc, d) => acc + d.remainingAmount, 0))}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                <div className="p-5 border-b border-[#F1F5F9] bg-[#FCFCFD]">
                  <h3 className="font-bold text-sm uppercase tracking-tight">Detalhamento dos Custos</h3>
                </div>
                <div className="divide-y divide-[#F1F5F9]">
                  {[
                    ...transactions.filter(t => t.isWorkExpense).map(t => ({ 
                      id: t.id, 
                      name: t.description, 
                      amount: t.amount, 
                      date: t.date, 
                      type: 'Pago',
                      card: t.cardId ? cards.find(c => c.id === t.cardId)?.name : 'Dinheiro/Pix'
                    })),
                    ...debts.filter(d => d.isWorkExpense).map(d => ({ 
                      id: d.id, 
                      name: d.creditor, 
                      amount: d.remainingAmount, 
                      date: d.dueDate || '', 
                      type: 'Pendente',
                      card: d.cardId ? cards.find(c => c.id === d.cardId)?.name : 'A Faturar'
                    }))
                  ].sort((a, b) => b.date.localeCompare(a.date)).map((item, idx) => (
                    <div key={idx} className="p-4 flex justify-between items-center hover:bg-[#F8FAFC] transition-colors">
                      <div className="flex-1 pr-4">
                        <p className="font-bold text-sm text-[#1E293B]">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-[#94A3B8] uppercase">{formatDate(item.date)}</span>
                          <span className="text-[10px] text-[#CBD5E1]">•</span>
                          <span className="text-[10px] font-bold text-[#2563EB] uppercase tracking-tighter">{item.card}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-[#1E293B]">{formatCurrency(item.amount)}</p>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                          item.type === 'Pago' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'
                        }`}>
                          {item.type.trim()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {transactions.filter(t => t.isWorkExpense).length === 0 && debts.filter(d => d.isWorkExpense).length === 0 && (
                    <div className="py-20 text-center">
                      <p className="text-[#94A3B8] font-medium text-xs">Nenhum gasto da obra registrado ainda.</p>
                      <p className="text-[10px] text-[#CBD5E1] mt-1">Marque a opção "Gasto da Obra" ao adicionar despesas.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-3xl mx-auto px-6 py-6 border-t border-[#E2E8F0] mt-12 mb-28 text-center">
        <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-widest block font-mono">Finanza Gestor © 2026</p>
      </footer>

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => {
          setQuickAddTab('transaction');
          setShowQuickAdd(true);
        }}
        className="fixed bottom-24 right-6 z-30 w-14 h-14 rounded-full bg-[#2563EB] text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-2xl font-bold border border-[#3B82F6] cursor-pointer"
        title="Gasto Rápido"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] shadow-2xl py-2 px-4 flex justify-around items-center">
        <div className="w-full max-w-xl mx-auto flex justify-around items-center">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 py-1 text-center flex-1 transition-all cursor-pointer ${
              ['dashboard', 'transactions', 'cards', 'negotiations'].includes(activeTab)
                ? 'text-[#2563EB]'
                : 'text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Início</span>
          </button>

          <button
            onClick={() => setActiveTab('debts')}
            className={`flex flex-col items-center gap-1 py-1 text-center flex-1 transition-all cursor-pointer ${
              activeTab === 'debts' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Minhas Contas</span>
          </button>

          <button
            onClick={() => setActiveTab('work-summary')}
            className={`flex flex-col items-center gap-1 py-1 text-center flex-1 transition-all cursor-pointer ${
              activeTab === 'work-summary' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            <Hammer className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-wider">Minha Obra</span>
          </button>
        </div>
      </div>

      {/* Quick Add Modal */}
      <AnimatePresence>
        {showQuickAdd && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            {/* Backdrop Blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQuickAdd(false)}
              className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-xs"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ y: 100, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#E2E8F0] overflow-hidden z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-[#F1F5F9] flex justify-between items-center bg-[#F8FAFC]">
                <h3 className="font-black text-lg text-[#1E293B]">Lançamento Rápido</h3>
                <button 
                  onClick={() => setShowQuickAdd(false)}
                  className="p-1.5 rounded-full hover:bg-[#E2E8F0] text-[#64748B] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Selector inside Modal (Transaction vs Debt) */}
              <div className="flex bg-[#F1F5F9] p-1 mx-5 mt-4 rounded-xl border border-[#E2E8F0] shrink-0">
                <button
                  type="button"
                  onClick={() => setQuickAddTab('transaction')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${quickAddTab === 'transaction' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B]'}`}
                >
                  Gasto (Cartão/Outros)
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAddTab('debt')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${quickAddTab === 'debt' ? 'bg-white text-[#2563EB] shadow-xs font-black' : 'text-[#64748B]'}`}
                >
                  Dívida (Parcelada/Contas)
                </button>
              </div>

              <div className="p-5 overflow-y-auto">
                {quickAddTab === 'transaction' ? (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const method = fd.get('method') as string;
                    const [type, id] = method.split(':');
                    
                    addTransaction({
                      description: fd.get('description') as string,
                      amount: Number(fd.get('amount')),
                      type: 'expense',
                      category: fd.get('category') as string,
                      date: fd.get('date') as string,
                      isWorkExpense: fd.get('isWorkExpense') === 'on'
                    }, type === 'cc' ? id : undefined);
                    setShowQuickAdd(false);
                  }} className="space-y-4 text-sm">
                    <div>
                      <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Descrição</label>
                      <input name="description" required placeholder="Jantar, Supermercado..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Valor (R$)</label>
                        <input name="amount" type="number" step="0.01" inputMode="decimal" required placeholder="0,00" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Categoria</label>
                        <input name="category" required placeholder="Lazer, Mercado..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Data</label>
                        <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Forma de Pagamento</label>
                        <select name="method" required className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]">
                          <optgroup label="Usar Limite do Cartão">
                            {cards.map(card => (
                              <option key={card.id} value={`cc:${card.id}`}>{card.name} (Disp: {formatCurrency(card.availableLimit)})</option>
                            ))}
                          </optgroup>
                          <option value="other:direct">Dinheiro / Pix Direto</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" name="isWorkExpense" id="modalIsWorkExpense" className="w-4 h-4 rounded-md accent-[#2563EB]" />
                      <label htmlFor="modalIsWorkExpense" className="text-xs font-bold text-[#1E293B] select-none cursor-pointer">Este é um gasto da Obra (Construção)</label>
                    </div>

                    <div className="pt-4">
                      <button type="submit" className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-bold hover:bg-[#1D4ED8] transition-colors uppercase text-xs tracking-wider cursor-pointer">Confirmar Gasto</button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const type = fd.get('type') as 'fixed' | 'unique' | 'installments';
                    const installments = Number(fd.get('installments') || 1);
                    
                    addDebt({
                      creditor: fd.get('creditor') as string,
                      totalAmount: Number(fd.get('amount')),
                      dueDate: fd.get('dueDate') as string,
                      type,
                      category: fd.get('category') as string,
                      isWorkExpense: fd.get('isWorkExpense') === 'on'
                    }, installments);
                    setShowQuickAdd(false);
                  }} className="space-y-4 text-sm">
                    <div>
                      <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Credor / Descrição</label>
                      <input name="creditor" required placeholder="Aluguel, Internet, Compra Loja..." className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Valor Total (R$)</label>
                        <input name="amount" type="number" step="0.01" inputMode="decimal" required placeholder="0,00" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Tipo de Lançamento</label>
                        <select name="type" required defaultValue="unique" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]">
                          <option value="unique">Única (Pagamento à vista)</option>
                          <option value="fixed">Fixa (Mensal Recorrente)</option>
                          <option value="installments">Parcelada</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Data Vencimento</label>
                        <input name="dueDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Categoria</label>
                        <select name="category" required defaultValue={debtSubTab === 'old' ? 'A Negociar' : 'Dívida Geral'} className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]">
                          <option value="Dívida Geral">Dívida Geral</option>
                          <option value="A Negociar">A Negociar (Dívidas Antigas)</option>
                          <option value="Serviços fundamentais">Serviços fundamentais</option>
                          <option value="Assinaturas">Assinaturas</option>
                          <option value="Outros">Outros</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="text-[10px] font-black text-[#94A3B8] uppercase block mb-1">Qtd Parcelas (Se Parcelado)</label>
                        <input name="installments" type="number" min="1" defaultValue="1" className="w-full bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-xl outline-none focus:ring-1 focus:ring-[#2563EB]" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" name="isWorkExpense" id="modalDebtIsWorkExpense" className="w-4 h-4 rounded-md accent-[#2563EB]" />
                      <label htmlFor="modalDebtIsWorkExpense" className="text-xs font-bold text-[#1E293B] select-none cursor-pointer">Este é um gasto da Obra (Construção)</label>
                    </div>

                    <div className="pt-4">
                      <button type="submit" className="w-full bg-[#2563EB] text-white py-3 rounded-xl font-bold hover:bg-[#1D4ED8] transition-colors uppercase text-xs tracking-wider cursor-pointer">Salvar Lançamento</button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
