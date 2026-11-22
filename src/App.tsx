const updateDebtSmart = (id: string, updates: Partial<Debt>, applyToFuture: boolean = false) => {
  const target = debts.find(d => d.id === id);
  if (!target) return;

  const amountChanged =
    updates.totalAmount !== undefined && updates.totalAmount !== target.totalAmount;

  // aplica as mudanças e recalcula o "restante" se o valor mudou
  const applyTo = (d: Debt, data: Partial<Debt>): Debt => {
    const merged = { ...d, ...data };
    if (!amountChanged) return merged;
    const paid = (d.payments || []).reduce((acc, p) => acc + p.amount, 0);
    const remaining = d.status === 'paid'
      ? 0
      : Math.max(0, Number((merged.totalAmount - paid).toFixed(2)));
    return { ...merged, remainingAmount: remaining };
  };

  const gid = target.installmentInfo?.groupId || target.recurringGroupId;

  if (applyToFuture && gid) {
    // nas futuras não copia data, parcela, pagamentos nem status
    const { dueDate, installmentInfo, recurringGroupId, payments, status, remainingAmount, ...shared } = updates;
    setDebts(current => current.map(d => {
      if (d.id === id) return applyTo(d, updates);
      const dGid = d.installmentInfo?.groupId || d.recurringGroupId;
      if (dGid === gid && (d.dueDate || '') >= (target.dueDate || '') && d.status !== 'paid') {
        return applyTo(d, shared);
      }
      return d;
    }));
  } else {
    setDebts(current => current.map(d => d.id === id ? applyTo(d, updates) : d));
  }
};