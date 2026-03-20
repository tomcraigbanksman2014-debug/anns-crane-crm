"use client";

import { useEffect } from "react";

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function parseValue(input: HTMLInputElement | null) {
  if (!input) return 0;
  const n = Number(String(input.value || "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return roundMoney(value).toFixed(2);
}

export default function TransportJobFormEnhancer() {
  useEffect(() => {
    const sellRateInput = document.getElementById("agreed_sell_rate") as HTMLInputElement | null;
    const subtotalInput = document.getElementById("invoice_subtotal") as HTMLInputElement | null;
    const vatInput = document.getElementById("invoice_vat") as HTMLInputElement | null;
    const totalInput = document.getElementById("total_invoice") as HTMLInputElement | null;

    const supplierSelect = document.getElementById("supplier_id") as HTMLSelectElement | null;
    const otherSupplierWrap = document.getElementById("other_supplier_wrap") as HTMLDivElement | null;
    const otherSupplierInput = document.getElementById("other_supplier_name") as HTMLInputElement | null;

    if (!subtotalInput || !vatInput || !totalInput) return;

    let lastSyncedSubtotal = parseValue(subtotalInput);

    function recalcFromSubtotal() {
      const subtotal = roundMoney(parseValue(subtotalInput));
      const vat = roundMoney(subtotal * 0.2);
      const total = roundMoney(subtotal + vat);

      vatInput.value = formatMoney(vat);
      totalInput.value = formatMoney(total);
      lastSyncedSubtotal = subtotal;
    }

    function syncSubtotalFromSellRate() {
      if (!sellRateInput) return;

      const sellRate = roundMoney(parseValue(sellRateInput));
      const currentSubtotal = roundMoney(parseValue(subtotalInput));

      if (currentSubtotal === 0 || currentSubtotal === lastSyncedSubtotal) {
        subtotalInput.value = formatMoney(sellRate);
      }

      recalcFromSubtotal();
    }

    function toggleOtherSupplier() {
      if (!supplierSelect || !otherSupplierWrap || !otherSupplierInput) return;

      const isOther = supplierSelect.value === "other";
      otherSupplierWrap.style.display = isOther ? "block" : "none";
      otherSupplierInput.required = isOther;

      if (!isOther) {
        otherSupplierInput.value = "";
      }
    }

    sellRateInput?.addEventListener("input", syncSubtotalFromSellRate);
    sellRateInput?.addEventListener("change", syncSubtotalFromSellRate);

    subtotalInput.addEventListener("input", recalcFromSubtotal);
    subtotalInput.addEventListener("change", recalcFromSubtotal);

    supplierSelect?.addEventListener("change", toggleOtherSupplier);

    if (parseValue(subtotalInput) === 0 && sellRateInput) {
      subtotalInput.value = formatMoney(parseValue(sellRateInput));
    }

    recalcFromSubtotal();
    toggleOtherSupplier();

    return () => {
      sellRateInput?.removeEventListener("input", syncSubtotalFromSellRate);
      sellRateInput?.removeEventListener("change", syncSubtotalFromSellRate);

      subtotalInput.removeEventListener("input", recalcFromSubtotal);
      subtotalInput.removeEventListener("change", recalcFromSubtotal);

      supplierSelect?.removeEventListener("change", toggleOtherSupplier);
    };
  }, []);

  return null;
}
