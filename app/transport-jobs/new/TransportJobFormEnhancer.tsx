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

    const customerSelect = document.getElementById("client_id") as HTMLSelectElement | null;
    const otherCustomerWrap = document.getElementById("other_customer_wrap") as HTMLDivElement | null;
    const otherCustomerInput = document.getElementById("other_customer_name") as HTMLInputElement | null;

    const supplierSelect = document.getElementById("supplier_id") as HTMLSelectElement | null;
    const otherSupplierWrap = document.getElementById("other_supplier_wrap") as HTMLDivElement | null;
    const otherSupplierInput = document.getElementById("other_supplier_name") as HTMLInputElement | null;

    const supplierCostInput = document.getElementById("supplier_cost") as HTMLInputElement | null;
    const supplierReferenceInput = document.getElementById("supplier_reference") as HTMLInputElement | null;

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

    if (!subtotalInput || !vatInput || !totalInput) return;

    let lastSyncedSubtotal = parseValue(subtotalInput);
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
      if (!sellRateInput) return;

      const sellRate = roundMoney(parseValue(sellRateInput));
      const currentSubtotal = roundMoney(parseValue(subtotalInput));

      if (currentSubtotal === 0 || currentSubtotal === lastSyncedSubtotal) {
        subtotalInput.value = formatMoney(sellRate);
      }

      recalcFromSubtotal();
    }

    function toggleOtherCustomer() {
      if (!customerSelect || !otherCustomerWrap || !otherCustomerInput) return;

      const isOther = customerSelect.value === "other";
      otherCustomerWrap.style.display = isOther ? "block" : "none";
      otherCustomerInput.required = isOther;

      if (!isOther) {
        otherCustomerInput.value = "";
      }
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

    function autoSyncDeliveryDate() {
      if (!collectionDateInput || !deliveryDateInput) return;
      if (userManuallyChangedDeliveryDate && deliveryDateInput.value) return;

      deliveryDateInput.value = collectionDateInput.value || "";
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
        collectionAddressLabel.textContent = isOnSite ? "Site address" : "Pickup address";
      }

      if (deliveryAddressLabel) {
        deliveryAddressLabel.textContent = isOnSite
          ? "Work area / secondary location"
          : "Delivery address";
      }

      if (loadDescriptionLabel) {
        loadDescriptionLabel.textContent = isOnSite
          ? "On-site task description"
          : "Load description";
      }

      if (collectionAddressInput) {
        collectionAddressInput.placeholder = isOnSite
          ? "Enter main site address"
          : "Enter pickup address";
      }

      if (deliveryAddressInput) {
        deliveryAddressInput.placeholder = isOnSite
          ? "Optional second location on the same site"
          : "Enter delivery address";
      }

      if (loadDescriptionInput) {
        loadDescriptionInput.placeholder = isOnSite
          ? "Describe the on-site HIAB work, contract lift support or site movement"
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

    function maybeOpenSupplierSection() {
      const hasSupplierValue =
        !!supplierSelect?.value ||
        !!supplierCostInput?.value ||
        !!supplierReferenceInput?.value ||
        !!otherSupplierInput?.value;

      const section = document.getElementById("supplier_details_section") as HTMLDetailsElement | null;
      if (section && hasSupplierValue) {
        section.open = true;
      }
    }

    function maybeOpenInvoiceSection() {
      const section = document.getElementById("invoice_details_section") as HTMLDetailsElement | null;
      if (section && (parseValue(subtotalInput) > 0 || parseValue(vatInput) > 0 || parseValue(totalInput) > 0)) {
        section.open = true;
      }
    }

    sellRateInput?.addEventListener("input", syncSubtotalFromSellRate);
    sellRateInput?.addEventListener("change", syncSubtotalFromSellRate);

    subtotalInput.addEventListener("input", recalcFromSubtotal);
    subtotalInput.addEventListener("change", recalcFromSubtotal);

    customerSelect?.addEventListener("change", toggleOtherCustomer);
    supplierSelect?.addEventListener("change", toggleOtherSupplier);

    collectionDateInput?.addEventListener("input", autoSyncDeliveryDate);
    collectionDateInput?.addEventListener("change", autoSyncDeliveryDate);

    collectionTimeInput?.addEventListener("change", autoSyncDeliveryTime);

    deliveryDateInput?.addEventListener("input", () => {
      userManuallyChangedDeliveryDate = true;
    });
    deliveryDateInput?.addEventListener("change", () => {
      userManuallyChangedDeliveryDate = true;
    });

    deliveryTimeInput?.addEventListener("change", () => {
      userManuallyChangedDeliveryTime = true;
    });

    jobTypeSelect?.addEventListener("change", applyOnSiteLabels);
    collectionAddressInput?.addEventListener("blur", applyOnSiteLabels);

    if (parseValue(subtotalInput) === 0 && sellRateInput) {
      subtotalInput.value = formatMoney(parseValue(sellRateInput));
    }

    autoSyncDeliveryDate();
    autoSyncDeliveryTime();
    recalcFromSubtotal();
    toggleOtherCustomer();
    toggleOtherSupplier();
    applyOnSiteLabels();
    maybeOpenSupplierSection();
    maybeOpenInvoiceSection();

    return () => {
      sellRateInput?.removeEventListener("input", syncSubtotalFromSellRate);
      sellRateInput?.removeEventListener("change", syncSubtotalFromSellRate);

      subtotalInput.removeEventListener("input", recalcFromSubtotal);
      subtotalInput.removeEventListener("change", recalcFromSubtotal);

      customerSelect?.removeEventListener("change", toggleOtherCustomer);
      supplierSelect?.removeEventListener("change", toggleOtherSupplier);

      collectionDateInput?.removeEventListener("input", autoSyncDeliveryDate);
      collectionDateInput?.removeEventListener("change", autoSyncDeliveryDate);

      collectionTimeInput?.removeEventListener("change", autoSyncDeliveryTime);

      jobTypeSelect?.removeEventListener("change", applyOnSiteLabels);
      collectionAddressInput?.removeEventListener("blur", applyOnSiteLabels);
    };
  }, []);

  return null;
}
