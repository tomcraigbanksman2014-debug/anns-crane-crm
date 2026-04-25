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
    const abnormalLoadCheckbox = document.querySelector('input[name="abnormal_load_enabled"]') as HTMLInputElement | null;
    const abnormalLoadFieldsWrap = document.getElementById("abnormal_load_fields_wrap") as HTMLDivElement | null;
    const policeEscortCheckbox = document.getElementById("police_escort_required") as HTMLInputElement | null;
    const policeEscortFieldsWrap = document.getElementById("police_escort_fields_wrap") as HTMLDivElement | null;
    const addPoliceEscortRowBtn = document.getElementById("add_police_escort_row_btn") as HTMLButtonElement | null;
    const policeEscortRows = Array.from(document.querySelectorAll('[data-police-escort-row="true"]')) as HTMLDivElement[];

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

    type ChecklistRule = {
      checkboxName: string;
      auto: boolean;
      evaluate: () => boolean;
      note?: string;
    };

    function hasText(id: string) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      return !!String(el?.value || "").trim();
    }

    function numericPositive(id: string) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      const n = Number(String(el?.value || "").trim());
      return Number.isFinite(n) && n > 0;
    }

    function checkboxChecked(id: string) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return !!el?.checked;
    }

    function anyNumericPositive(ids: string[]) {
      return ids.some((id) => numericPositive(id));
    }

    function anyText(ids: string[]) {
      return ids.some((id) => hasText(id));
    }

    function submissionStatusValue() {
      const el = document.getElementById("submission_status") as HTMLSelectElement | null;
      return String(el?.value || "").trim().toLowerCase();
    }

    function approvalStatusValue() {
      const el = document.getElementById("approval_status") as HTMLSelectElement | null;
      return String(el?.value || "").trim().toLowerCase();
    }

    function movementChecklistRules(): ChecklistRule[] {
      const escortRequired = checkboxChecked("escort_required");
      return [
        { checkboxName: "checklist_dimensions_confirmed", auto: true, evaluate: () => ["load_length_m", "load_width_m", "load_height_m", "transport_length_m", "transport_width_m", "transport_height_m"].every(numericPositive), note: "Auto-completed from entered dimensions" },
        { checkboxName: "checklist_weight_confirmed", auto: true, evaluate: () => ["load_weight_t", "transport_gross_weight_t"].every(numericPositive), note: "Auto-completed from entered weights" },
        { checkboxName: "checklist_vehicle_confirmed", auto: true, evaluate: () => ["tractor_unit_type", "tractor_unit_registration", "trailer_type", "trailer_registration"].every(hasText), note: "Auto-completed from entered vehicle details" },
        { checkboxName: "checklist_axle_data_confirmed", auto: true, evaluate: () => hasText("axle_configuration") && (hasText("axle_weight_notes") || anyNumericPositive(["front_axle_t", "drive_axle_t", "trailer_axle_1_t", "trailer_axle_2_t", "trailer_axle_3_t", "trailer_axle_4_t"])), note: "Auto-completed from axle details" },
        { checkboxName: "checklist_route_checked", auto: false, evaluate: () => checkboxChecked("route_checked"), note: "Manual confirmation required" },
        { checkboxName: "checklist_trailer_checked", auto: true, evaluate: () => ["trailer_type", "trailer_registration"].every(hasText), note: "Auto-completed from trailer details" },
        { checkboxName: "checklist_escort_checked", auto: true, evaluate: () => !escortRequired || (hasText("escort_provider") && anyText(["escort_contact_name", "escort_contact_phone", "escort_details"])), note: escortRequired ? "Auto-completed when escort details are filled" : "Auto-completed because escort is not required" },
        { checkboxName: "checklist_site_access_checked", auto: false, evaluate: () => hasText("access_notes"), note: "Manual confirmation required" },
        { checkboxName: "checklist_contacts_confirmed", auto: true, evaluate: () => ["collection_contact_name", "collection_contact_phone", "delivery_contact_name", "delivery_contact_phone"].every(hasText), note: "Auto-completed from entered contacts" },
        { checkboxName: "checklist_authorities_identified", auto: true, evaluate: () => hasText("authority_areas") || anyText(["police_reference", "highways_reference", "bridge_reference", "council_reference", "special_order_reference", "vr1_reference"]), note: "Auto-completed from authority areas or references" },
        { checkboxName: "checklist_customer_approved", auto: false, evaluate: () => false, note: "Manual confirmation required" },
        { checkboxName: "checklist_supplier_booked", auto: false, evaluate: () => false, note: "Manual confirmation required" },
        { checkboxName: "checklist_documents_uploaded", auto: false, evaluate: () => false, note: "Manual confirmation required" },
        { checkboxName: "checklist_submission_reviewed", auto: false, evaluate: () => false, note: "Manual confirmation required" },
        { checkboxName: "checklist_movement_order_submitted", auto: true, evaluate: () => ["submitted", "awaiting_response", "awaiting_approval", "approved", "completed"].includes(submissionStatusValue()) || hasText("movement_order_submitted_at"), note: "Auto-completed from submission status" },
        { checkboxName: "checklist_approval_received", auto: true, evaluate: () => ["approved", "restricted", "not_required"].includes(approvalStatusValue()) || hasText("approval_received_at") || hasText("approval_reference"), note: "Auto-completed from approval details" },
      ];
    }

    function syncMovementChecklist() {
      const abnormalEnabled = checkboxChecked("abnormal_load_enabled");
      const checklist = movementChecklistRules();

      checklist.forEach((rule) => {
        const checkbox = document.querySelector(`input[name="${rule.checkboxName}"]`) as HTMLInputElement | null;
        const row = checkbox?.closest("label") as HTMLLabelElement | null;
        if (!checkbox || !row) return;

        const done = abnormalEnabled && rule.evaluate();
        if (rule.auto) {
          checkbox.checked = done;
        }

        row.style.border = done
          ? "1px solid rgba(16,185,129,0.35)"
          : abnormalEnabled
            ? "1px solid rgba(220,38,38,0.28)"
            : "1px solid rgba(0,0,0,0.08)";
        row.style.background = done
          ? "rgba(16,185,129,0.10)"
          : abnormalEnabled
            ? "rgba(220,38,38,0.08)"
            : "rgba(255,255,255,0.7)";

        checkbox.title = rule.note || "";
        row.title = rule.note || "";
      });
    }

    function updatePoliceEscortAddButton() {
      if (!addPoliceEscortRowBtn) return;
      const abnormalEnabled = !!abnormalLoadCheckbox?.checked;
      const policeEnabled = !!policeEscortCheckbox?.checked;
      const hiddenCount = policeEscortRows.filter((row) => row.style.display === "none").length;
      addPoliceEscortRowBtn.style.display = abnormalEnabled && policeEnabled && hiddenCount > 0 ? "inline-block" : "none";
    }

    function syncPoliceEscortVisibility() {
      const abnormalEnabled = !!abnormalLoadCheckbox?.checked;
      const policeEnabled = !!policeEscortCheckbox?.checked;
      const enabled = abnormalEnabled && policeEnabled;

      if (policeEscortFieldsWrap) {
        policeEscortFieldsWrap.style.display = enabled ? "grid" : "none";
      }

      if (enabled) {
        const hasVisible = policeEscortRows.some((row) => row.style.display !== "none");
        if (!hasVisible && policeEscortRows[0]) {
          policeEscortRows[0].style.display = "grid";
        }
      }

      updatePoliceEscortAddButton();
    }

    function addPoliceEscortRow() {
      const nextHidden = policeEscortRows.find((row) => row.style.display === "none");
      if (nextHidden) {
        nextHidden.style.display = "grid";
      }
      updatePoliceEscortAddButton();
    }

    function syncAbnormalLoadVisibility() {
      const enabled = !!abnormalLoadCheckbox?.checked;
      if (abnormalLoadFieldsWrap) {
        abnormalLoadFieldsWrap.style.display = enabled ? "block" : "none";
      }
      syncPoliceEscortVisibility();
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
    abnormalLoadCheckbox?.addEventListener("change", syncAbnormalLoadVisibility);
    policeEscortCheckbox?.addEventListener("change", syncPoliceEscortVisibility);
    addPoliceEscortRowBtn?.addEventListener("click", addPoliceEscortRow);
    collectionAddressInput?.addEventListener("blur", applyOnSiteLabels);

    const checklistWatchers = [
      "abnormal_load_enabled",
      "load_length_m", "load_width_m", "load_height_m",
      "load_weight_t", "transport_length_m", "transport_width_m", "transport_height_m", "transport_gross_weight_t",
      "tractor_unit_type", "tractor_unit_registration", "trailer_type", "trailer_registration",
      "axle_configuration", "axle_weight_notes", "front_axle_t", "drive_axle_t", "trailer_axle_1_t", "trailer_axle_2_t", "trailer_axle_3_t", "trailer_axle_4_t",
      "collection_contact_name", "collection_contact_phone", "delivery_contact_name", "delivery_contact_phone",
      "escort_required", "escort_provider", "escort_contact_name", "escort_contact_phone", "escort_details",
      "authority_areas", "police_reference", "highways_reference", "bridge_reference", "council_reference", "special_order_reference", "vr1_reference",
      "route_checked", "access_notes", "submission_status", "movement_order_submitted_at", "approval_status", "approval_received_at", "approval_reference"
    ];
    const checklistSyncHandler = () => syncMovementChecklist();
    checklistWatchers.forEach((id) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      el?.addEventListener("input", checklistSyncHandler);
      el?.addEventListener("change", checklistSyncHandler);
    });

    recalcFromSubtotal();
    autoSyncDeliveryDate();
    autoSyncDeliveryTime();
    applyOnSiteLabels();
    syncSellRateFromPricingMode();
    syncPoliceEscortVisibility();
    syncMovementChecklist();

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
      abnormalLoadCheckbox?.removeEventListener("change", syncAbnormalLoadVisibility);
      policeEscortCheckbox?.removeEventListener("change", syncPoliceEscortVisibility);
      addPoliceEscortRowBtn?.removeEventListener("click", addPoliceEscortRow);
      checklistWatchers.forEach((id) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        el?.removeEventListener("input", checklistSyncHandler);
        el?.removeEventListener("change", checklistSyncHandler);
      });
    };
  }, []);

  return null;
}
