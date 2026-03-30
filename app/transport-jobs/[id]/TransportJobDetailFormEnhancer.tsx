"use client";

import { useEffect } from "react";

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function parseValue(input: HTMLInputElement | HTMLSelectElement | null) {
  if (!input) return 0;
  const n = Number(String(input.value || "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return roundMoney(value).toFixed(2);
}

function countInclusiveDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.max(count, 1);
}

export default function TransportJobDetailFormEnhancer() {
  useEffect(() => {
    const priceModeInput = document.getElementById("price_mode") as HTMLSelectElement | null;
    const sellRateInput = document.getElementById("agreed_sell_rate") as HTMLInputElement | null;
    const pricePerDayInput = document.getElementById("price_per_day") as HTMLInputElement | null;
    const subtotalInput = document.getElementById("invoice_subtotal") as HTMLInputElement | null;
    const vatInput = document.getElementById("invoice_vat") as HTMLInputElement | null;
    const totalInput = document.getElementById("total_invoice") as HTMLInputElement | null;

    const collectionDateInput = document.getElementById("transport_date") as HTMLInputElement | null;
    const collectionTimeInput = document.getElementById("collection_time") as HTMLSelectElement | null;
    const deliveryDateInput = document.getElementById("delivery_date") as HTMLInputElement | null;
    const deliveryTimeInput = document.getElementById("delivery_time") as HTMLSelectElement | null;

    const jobTypeSelect = document.getElementById("job_type") as HTMLSelectElement | null;
    const collectionAddressLabel = document.getElementById("collection_address_label") as HTMLLabelElement | null;
    const deliveryAddressLabel = document.getElementById("delivery_address_label") as HTMLLabelElement | null;
    const loadDescriptionLabel = document.getElementById("load_description_label") as HTMLLabelElement | null;
    const collectionAddressInput = document.getElementById("collection_address") as HTMLTextAreaElement | null;
    const deliveryAddressInput = document.getElementById("delivery_address") as HTMLTextAreaElement | null;
    const loadDescriptionInput = document.getElementById("load_description") as HTMLTextAreaElement | null;
    const hiabNotice = document.getElementById("on_site_hiab_notice") as HTMLDivElement | null;

    if (!sellRateInput || !subtotalInput || !vatInput || !totalInput) return;

    let lastSyncedSubtotal = roundMoney(parseValue(subtotalInput));
    let userManuallyChangedDeliveryDate = false;
    let userManuallyChangedDeliveryTime = false;

    function recalcFromSubtotal() {
      const subtotal = roundMoney(parseValue(subtotalInput));
      const vat = roundMoney(subtotal * 0.2);
      const total = roundMoney(subtotal + vat);

      vatInput.value = formatMoney(vat);
      totalInput.value = formatMoney(total);
      lastSyncedSubtotal = subtotal;
    }

    function syncSubtotalFromSellRate() {
      const sellRate = roundMoney(parseValue(sellRateInput));
      const currentSubtotal = roundMoney(parseValue(subtotalInput));

      if (currentSubtotal === 0 || currentSubtotal === lastSyncedSubtotal) {
        subtotalInput.value = formatMoney(sellRate);
      }

      recalcFromSubtotal();
    }

    function syncSellRateFromPricingMode() {
      if (!priceModeInput) {
        syncSubtotalFromSellRate();
        return;
      }

      const mode = priceModeInput.value;
      const days = countInclusiveDays(
        collectionDateInput?.value || "",
        deliveryDateInput?.value || collectionDateInput?.value || ""
      );

      if (mode === "per_day") {
        const perDay = roundMoney(parseValue(pricePerDayInput));
        sellRateInput.value = formatMoney(perDay * days);
        sellRateInput.readOnly = true;
        sellRateInput.style.background = "rgba(255,255,255,0.72)";
        sellRateInput.style.fontWeight = "800";
      } else {
        sellRateInput.readOnly = false;
        sellRateInput.style.background = "rgba(255,255,255,0.9)";
        sellRateInput.style.fontWeight = "400";
      }

      syncSubtotalFromSellRate();
    }

    function autoSyncDeliveryDate() {
      if (!collectionDateInput || !deliveryDateInput) return;
      if (userManuallyChangedDeliveryDate && deliveryDateInput.value) return;
      deliveryDateInput.value = collectionDateInput.value || "";
      syncSellRateFromPricingMode();
    }

    function autoSyncDeliveryTime() {
      if (!collectionTimeInput || !deliveryTimeInput) return;
      if (userManuallyChangedDeliveryTime && deliveryTimeInput.value) return;
      if (deliveryTimeInput.value) return;
      deliveryTimeInput.value = collectionTimeInput.value || "";
    }

    function applyOnSiteLabels() {
      if (!jobTypeSelect) return;
      const isOnSite = jobTypeSelect.value === "on_site_hiab";

      if (collectionAddressLabel) {
        collectionAddressLabel.textContent = isOnSite ? "Site address" : "Pickup / site address";
      }

      if (deliveryAddressLabel) {
        deliveryAddressLabel.textContent = isOnSite
          ? "Work area / secondary location"
          : "Delivery / work area address";
      }

      if (loadDescriptionLabel) {
        loadDescriptionLabel.textContent = isOnSite
          ? "On-site task description"
          : "Load / task description";
      }

      if (collectionAddressInput) {
        collectionAddressInput.placeholder = isOnSite
          ? "Enter the main site address"
          : "Enter pickup address";
      }

      if (deliveryAddressInput) {
        deliveryAddressInput.placeholder = isOnSite
          ? "Optional second area on the same site"
          : "Enter delivery address";
      }

      if (loadDescriptionInput) {
        loadDescriptionInput.placeholder = isOnSite
          ? "Describe the on-site HIAB work, lift support or movement required"
          : "Describe the load, crane parts, ballast, equipment or haulage item";
      }

      if (hiabNotice) {
        hiabNotice.style.display = isOnSite ? "block" : "none";
      }

      if (isOnSite && collectionAddressInput && deliveryAddressInput) {
        if (!deliveryAddressInput.value.trim() && collectionAddressInput.value.trim()) {
          deliveryAddressInput.value = collectionAddressInput.value.trim();
        }
      }
    }

    priceModeInput?.addEventListener("change", syncSellRateFromPricingMode);
    pricePerDayInput?.addEventListener("input", syncSellRateFromPricingMode);
    pricePerDayInput?.addEventListener("change", syncSellRateFromPricingMode);
    sellRateInput.addEventListener("input", syncSubtotalFromSellRate);
    sellRateInput.addEventListener("change", syncSubtotalFromSellRate);
    subtotalInput.addEventListener("input", recalcFromSubtotal);
    subtotalInput.addEventListener("change", recalcFromSubtotal);

    collectionDateInput?.addEventListener("input", autoSyncDeliveryDate);
    collectionDateInput?.addEventListener("change", autoSyncDeliveryDate);
    collectionDateInput?.addEventListener("change", syncSellRateFromPricingMode);
    deliveryDateInput?.addEventListener("change", syncSellRateFromPricingMode);

    collectionTimeInput?.addEventListener("change", autoSyncDeliveryTime);

    deliveryDateInput?.addEventListener("input", () => {
      userManuallyChangedDeliveryDate = true;
    });
    deliveryDateInput?.addEventListener("change", () => {
      userManuallyChangedDeliveryDate = true;
      syncSellRateFromPricingMode();
    });

    deliveryTimeInput?.addEventListener("change", () => {
      userManuallyChangedDeliveryTime = true;
    });

    jobTypeSelect?.addEventListener("change", applyOnSiteLabels);
    collectionAddressInput?.addEventListener("blur", applyOnSiteLabels);

    recalcFromSubtotal();
    autoSyncDeliveryDate();
    autoSyncDeliveryTime();
    applyOnSiteLabels();
    syncSellRateFromPricingMode();

    return () => {
      priceModeInput?.removeEventListener("change", syncSellRateFromPricingMode);
      pricePerDayInput?.removeEventListener("input", syncSellRateFromPricingMode);
      pricePerDayInput?.removeEventListener("change", syncSellRateFromPricingMode);
      sellRateInput.removeEventListener("input", syncSubtotalFromSellRate);
      sellRateInput.removeEventListener("change", syncSubtotalFromSellRate);
      subtotalInput.removeEventListener("input", recalcFromSubtotal);
      subtotalInput.removeEventListener("change", recalcFromSubtotal);
      collectionDateInput?.removeEventListener("input", autoSyncDeliveryDate);
      collectionDateInput?.removeEventListener("change", autoSyncDeliveryDate);
      collectionDateInput?.removeEventListener("change", syncSellRateFromPricingMode);
      deliveryDateInput?.removeEventListener("change", syncSellRateFromPricingMode);
      collectionTimeInput?.removeEventListener("change", autoSyncDeliveryTime);
      jobTypeSelect?.removeEventListener("change", applyOnSiteLabels);
      collectionAddressInput?.removeEventListener("blur", applyOnSiteLabels);
    };
  }, []);

  return null;
}
