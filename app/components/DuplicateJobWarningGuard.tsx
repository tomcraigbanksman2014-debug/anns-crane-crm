"use client";

import { useEffect } from "react";

type GuardType = "crane" | "transport";

type Props = {
  type: GuardType;
};

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function endpointFor(type: GuardType) {
  return type === "transport" ? "/api/transport-jobs/check-duplicate" : "/api/jobs/check-duplicate";
}

function requestBodyFor(type: GuardType, formData: FormData) {
  if (type === "transport") {
    return {
      client_id: formValue(formData, "client_id"),
      transport_date: formValue(formData, "transport_date"),
      delivery_date: formValue(formData, "delivery_date"),
      vehicle_id: formValue(formData, "vehicle_id"),
    };
  }

  return {
    client_id: formValue(formData, "client_id"),
    start_date: formValue(formData, "start_date"),
    end_date: formValue(formData, "end_date"),
    primary_equipment_selection: formValue(formData, "primary_equipment_selection"),
    cross_hire_item_name: formValue(formData, "cross_hire_item_name"),
    other_item_name: formValue(formData, "other_item_name"),
  };
}

export default function DuplicateJobWarningGuard({ type }: Props) {
  useEffect(() => {
    const selector = `form[data-duplicate-check="${type}"]`;
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>(selector));

    const handlers = forms.map((form) => {
      const onSubmit = async (event: SubmitEvent) => {
        if (form.dataset.duplicateConfirmed === "true") {
          form.dataset.duplicateConfirmed = "";
          return;
        }

        event.preventDefault();

        const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;
        const formData = new FormData(form);

        try {
          const res = await fetch(endpointFor(type), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBodyFor(type, formData)),
          });

          const json = await res.json().catch(() => null);

          if (res.ok && json?.duplicate) {
            const message = String(
              json.message ||
                "A similar job already exists. This may be a duplicate. Are you sure you wish to save?"
            );

            const confirmed = window.confirm(message);
            if (!confirmed) return;
          }
        } catch {
          const confirmed = window.confirm(
            "The CRM could not complete the duplicate check. The job may still save correctly, but please double-check the planner. Do you still want to save?"
          );
          if (!confirmed) return;
        }

        form.dataset.duplicateConfirmed = "true";
        if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
          form.requestSubmit(submitter);
        } else {
          form.requestSubmit();
        }
      };

      form.addEventListener("submit", onSubmit);
      return () => form.removeEventListener("submit", onSubmit);
    });

    return () => {
      handlers.forEach((cleanup) => cleanup());
    };
  }, [type]);

  return null;
}
