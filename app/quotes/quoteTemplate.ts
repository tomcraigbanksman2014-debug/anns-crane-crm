export type StructuredQuoteFields = {
  contactName: string;
  contactPhone: string;
  projectDateTime: string;
  siteLocation: string;
  hireType: string;
  toSupply: string;
  scopeOfWork: string;
  workLocation: string;
  workDates: string;
  duration: string;
  workingHours: string;
  costSummary: string;
  additionalEquipment: string;
  includedItems: string;
  breakdown: string;
  additionalNotes: string;
  paymentTerms: string;
};

export const DEFAULT_PAYMENT_TERMS = "30 days from Month End";

export const DEFAULT_HIRE_TERMS_TEXT = `ALL WORK IS SUBJECT TO CPA OR RHA TERMS AND CONDITIONS, ADDITIONAL TERMS BELOW:
# INSURANCE & CONDITIONS OF HIRE
If the quotation is for Crane Hire Only, it is the Hirer’s responsibility to provide:
• Hired-In Plant Insurance
• Goods on the Hook Insurance
• Appointed Person
• Slinger / Banksman
If required, Anns Crane Hire Ltd can provide the above services and insurances. Price available upon application.

### Contract Lift
Under Contract Lift conditions:
• Hired-In Plant Insurance requirements are covered.
• A Damage Waiver is included.
• Anns Crane Hire Ltd liability for Goods on the Hook is limited to a maximum of £25,000.
  Increased cover is available upon request.

## Conditions of Hire
• All cranes, equipment, and work are supplied under CPA Terms and Conditions together with Anns Crane Hire Ltd Supplementary Conditions. Copies are available upon request.
• This quotation is valid for 30 days, after which it may be subject to review.
• The rate quoted is the minimum chargeable amount, irrespective of hours worked.
• Acceptance of services on site constitutes acceptance of these Terms & Conditions, which take precedence over any other conditions.
• The Client, by signing acceptance, confirms agreement to Anns Crane Hire Ltd General Hire Conditions and acknowledges that no consequential losses or liquidated damages are covered under any circumstances unless otherwise agreed in writing.

### TRANSPORT
• ANNS CRANE HIRE HAVE GOODS IN TRANSIT INSURNCE TO THE VALUE OF £500,000.00 PER EVENT
• Please note for transport quotes for hiab hire, curb side collection & delivery only is included as standard under CPA conditions. If a contract lift is required please let us know so this can be priced accordingly.

## Additional Charges
• Sling damage, tyre damage, and punctures are chargeable to the Hirer.
• Any Site Rate / Bonus awards signed on the crane hire timesheet will be charged plus the applicable percentage of the Employer’s National Insurance Contribution (NIC).
• VAT will be charged at the prevailing rate where applicable.
• Excess Labour Hours:
  • 8–10 hours – Pro rata
  • Over 12 hours – Double time
• Waiting Time:
  • Loading / unloading delays exceeding 30 minutes will incur a charge of £85.00 per hour.

## Cancellations
• Cranes up to 100 tonnes:
  • Cancel before 12:00pm on the previous working day – No charge
  • After 12:00pm – Full charge applies
• Cranes over 100 tonnes:
  • Cancel up to 2 working days prior – No charge
  • Within 2 working days – 2/3 of the hire charge applies

## Site Responsibilities
The Client is responsible for ensuring:
• Suitable access and egress
• Adequate ground conditions for the crane size
• Unrestricted working conditions for the full duration of the hire`;

export const DEFAULT_CONTRACT_TERMS_TEXT = `1.1 The terms and conditions set out in this document describe the trading policy and practice of the Company for its Contract Lifting Services, as distinct from its crane-hire services, and form the Standard Contract Terms and Conditions for any Contract Lifting Services entered into by the Company.
1.2 Contract Lifting Services means the supply of a supervised lifting service including planning and execution of the lifting operation in accordance with the relevant Regulations and Codes of Practice.
1.3 These terms and conditions shall not be varied except with the Company’s written agreement.
1.4 No other terms and conditions shall apply to any Contract Lifting Services contract entered into by the Company unless expressly agreed in writing by means of a quotation or otherwise between the Company and Client. Any terms and conditions specified by the Client on an order form or otherwise shall not be binding on the Company unless agreed in writing by the Company prior to commencement of the lifting operation.
1.5 Unless otherwise agreed by the Company and the Client, these terms and conditions also apply to any additional work that the Company may agree to carry out for the Client and which may arise from or is connected with any Contract Lifting Services contract.
1.6 Definitions:
1.6.1 Appointed Person means the person given the authority to assess, plan and organise the work; to select suitable plant and equipment; to ensure statutory documentation is current; to provide instruction and supervision for the work to be undertaken safely; and to stop the work whenever danger is likely to arise if it were to be continued.
1.6.2 Crane Supervisor means the person who supervises the lifting operation within the safe system of work developed by the Appointed Person and has the authority to stop the operation if it is unsafe to continue.
1.6.3 Client means the person or organisation requiring the lift to be carried out, and includes the Client’s employees, agents, assignees, successors and personal representatives.
1.6.4 Company means the company or firm agreeing to carry out the Contract Lifting Services and includes its assignees, successors and personal representatives.
1.6.5 Contract Equipment means any lifting appliance and other equipment and accessories used or intended to be used by the Company in performing, or in connection with, the Contract Lifting Services.
1.6.6 Contract Goods means the goods which are to be lifted by the Company in accordance with these terms and conditions.
1.6.7 Contract Lifting Services may include the removal, transportation, storage and installation of goods.
1.6.8 Contract Price means the price agreed by the Company and the Client as payment for the performance by the Company of the Contract Lifting Services.
1.6.9 Lifting Appliance means work equipment for lifting or lowering loads and includes its attachments used for anchoring, fixing or supporting it.
1.6.10 Regulations and Codes of Practice means LOLER 1998, PUWER 1998, BS 7121 and any other Regulations or Codes of Practice which may supersede them.
2.1 Unless otherwise specified by the Company in writing, every quotation is open for acceptance for a period of thirty days, after which the quotation will be subject to confirmation.
2.2 Unless otherwise specifically noted by the Company in writing, every quotation is based on the assumption that the work will be carried out under the Company’s direction without interruption and on a clear site with adequate approaches.
2.2.2 The Client is responsible for ensuring that the ground or other surface will be firm, level and in good condition, and will provide proper support for the loads imposed by the Contract Equipment.
2.2.3 The Contract Lifting Services will be carried out in daylight during normal working hours unless otherwise agreed.
2.2.4 All information provided by the Client is complete, true and accurate.
2.3 Where the above circumstances do not apply, the Company may issue a revised quotation. If not accepted, the Client shall be liable for the costs incurred by the Company.
2.4 Any additional work which the Company is required to perform must be authorised by the Client in writing and will involve an extra charge.
2.5 The Contract Price may be increased by costs incurred by the Company as a result of delays or cancellations due to circumstances beyond the Company’s reasonable control including weather or industrial action.
3.1 No contract is created before the Company accepts a written order for the carrying out of the Contract Lifting Services work. Commencement of the contract will be subject to availability of the Contract Equipment at the time requested.
3.2 If the Client terminates the contract without the written agreement of the Company, the Client is liable for the full Contract Price. If cancellation is agreed, the Client shall be liable for a reasonable proportion of the Contract Price together with all costs and charges incurred by the Company.
3.3 A contract involving an unspecified number of lifts over an indeterminate period may be terminated by either party giving not less than seven days’ notice in writing.
4.1 The Client warrants that the Client is the owner or authorised agent of the owner of the Contract Goods and is authorised to accept these terms and conditions.
4.2 The Client requires and authorises the Company to assume overall control of the Contract Lifting Services, provide the Appointed Person and plan, supervise, carry out and complete the Contract Lifting Services in accordance with the relevant Regulations and Codes of Practice.
4.3 The Client undertakes to clear the contract site, including public highways and access roads where necessary, of all vehicles and personnel not directly involved with the Contract Lifting Services and is responsible for barricades, tapes or cones where required.
4.4 With the permission of the Client, the Company may arrange for the Contract Lifting Services, or any part of the work, to be carried out by agents, sub-contractors or independent contractors.
5.1 The Company will perform the Contract Lifting Services in accordance with the relevant Regulations and Codes of Practice.
5.2 At the Client’s request, the Company will provide available information relevant to the qualifications and competence of the Appointed Person.
5.3 In the absence of written notice by the Client to the contrary, the Appointed Person and/or Crane Supervisor shall be deemed satisfactory to the Client.
5.4 The Client shall supply or confirm in writing all information requested by the Company or which the Client should reasonably be aware may be necessary or useful to facilitate compliance with Regulations and Codes of Practice.
6.1 The Company shall be liable for loss, damage or injury to persons or property when caused solely by the Company’s negligence in the performance of the contract and shall not be liable where the Client or a third party was wholly or partly negligent.
6.2 The Company’s liability, if any, arising from or in connection with the Contract Lifting Services contract shall be limited to £25,000 for Contract Goods and £5,000,000 for any other loss, damage or injury, unless otherwise agreed in writing.
6.3 Full details of any loss, damage or injury shall be notified by the Client within seven days of discovery. Proceedings to enforce any such claim must be commenced not later than twelve months after the event giving rise to the claim.
7.1 The Company shall not be liable for loss, damage or injury caused by defects in the Contract Goods, inaccurate or incomplete information given by the Client, instructions given by the Client to the Company’s employees, defects in equipment provided by the Client, acts or omissions of Client-supplied personnel, delay due to weather, industrial action or other circumstances beyond the Company’s control, or unforeseen subsidence or unstable ground conditions.
7.2 The Company shall not be liable for any indirect or consequential loss including loss of profit, loss of use, loss of production, loss of contracts, liabilities to third parties or any other economic loss.
8.1 The Company will carry insurance to cover its potential liability under the contract having regard to the maximum amounts referred to in clause 6.2.
8.2 The Company may require a specific insurance policy for a contract to be provided by and at the expense of the Client.
8.3 If the Company considers the Client’s insurance cover insufficient, the Company may require additional cover or take out such cover itself and recover the cost from the Client.
8.4 If the value of the Contract Goods exceeds the Company’s liability limits and the Client requires increased cover, sufficient written notice must be given so that additional cover can be agreed and charged.
8.5 The Client agrees to indemnify the Company against claims arising from or connected with the Company’s work on the contract site and all losses or claims for which the Client is liable or for which the Company is not liable under these terms.
8.6 The Client shall insure against its liability to indemnify the Company and all other liabilities of the Client under the contract.
8.7 If requested by the Company, the Client shall produce a copy of any insurance policy together with evidence of the premium having been paid.
9.1 The Company is not a common carrier.
9.2 If, under the contract, the Contract Goods require transportation by air, sea, road or rail, the Company may either undertake the transportation or arrange for transportation by another person or organisation.
9.3 Unless otherwise agreed in writing, the Company’s liability for Contract Goods transported by another person or organisation shall be no greater than that of that carrier.
10.1 All prices quoted are exclusive of VAT, which will be charged at the prevailing rate at the date of invoice.
10.2 All charges are payable strictly thirty days net from the date of the Company’s invoice or as set out in the contract offer.
10.3 All charges are payable in full and the Client shall not withhold payment as retention, discount or for any reason whatsoever.
10.4 The Company enforces its right to add interest and administration costs for late payments under the Late Payment of Commercial Debts Regulations.
10.5 The Company shall have a general lien over any goods and equipment or property of the Client in the custody of the Company for unpaid debts.
11.1 If the original contract site is in England or Wales, the proper law of the contract shall be English law. If in Scotland, Scots law shall apply. If in Northern Ireland, Northern Ireland law shall apply.
11.2 The Scheme for Construction Contracts (England and Wales) Regulations 1998, or any amendment or re-enactment, shall apply to the contract.
11.3 The Company and the Client shall comply forthwith with any decision of the adjudicator and submit to enforcement of such decisions.
1) Acceptance of the Contract Equipment on site implies acceptance of all these terms and conditions.
2) These standard terms and conditions for Contract Lifting Services are the copyright of the Construction Plant-hire Association and must not be reproduced or transmitted except as permitted.`;

const SECTION_LABELS: Array<[keyof StructuredQuoteFields, string]> = [
  ["contactName", "CONTACT NAME"],
  ["contactPhone", "CONTACT TEL"],
  ["projectDateTime", "PROJECT DATE & TIME"],
  ["siteLocation", "SITE LOCATION"],
  ["hireType", "HIRE TYPE"],
  ["toSupply", "TO SUPPLY"],
  ["scopeOfWork", "SCOPE OF WORK"],
  ["workLocation", "LOCATION"],
  ["workDates", "DATE(S)"],
  ["duration", "DURATION"],
  ["workingHours", "WORKING HOURS / PATTERN"],
  ["costSummary", "COST SUMMARY"],
  ["breakdown", "BREAKDOWN OF CURRENT CHARGES / RATES"],
  ["additionalEquipment", "ADDITIONAL EQUIPMENT & PERSONNEL"],
  ["includedItems", "INCLUDED UNDER FULL CPA TERMS"],
  ["additionalNotes", "ADDITIONAL QUOTE NOTES"],
  ["paymentTerms", "PAYMENT TERMS"],
];

export function getEmptyStructuredQuoteFields(): StructuredQuoteFields {
  return {
    contactName: "",
    contactPhone: "",
    projectDateTime: "",
    siteLocation: "",
    hireType: "Contract lift (subject to CPA contract lift term and conditions)",
    toSupply: "",
    scopeOfWork: "",
    workLocation: "",
    workDates: "",
    duration: "",
    workingHours: "",
    costSummary: "",
    additionalEquipment: "",
    includedItems: "",
    breakdown: "",
    additionalNotes: "",
    paymentTerms: DEFAULT_PAYMENT_TERMS,
  };
}

export function buildQuoteNotes(fields: StructuredQuoteFields): string {
  const parts: string[] = [];
  for (const [key, label] of SECTION_LABELS) {
    const value = String(fields[key] ?? "").trim();
    if (!value) continue;
    parts.push(`${label}:\n${value}`);
  }
  return parts.join("\n\n").trim();
}

export function parseQuoteNotes(notes: string | null | undefined): {
  fields: StructuredQuoteFields;
  isStructured: boolean;
  rawNotes: string;
} {
  const raw = String(notes ?? "").replace(/\r\n/g, "\n").trim();
  const fields = getEmptyStructuredQuoteFields();
  if (!raw) {
    return { fields, isStructured: false, rawNotes: "" };
  }

  const indexes = SECTION_LABELS.map(([key, label]) => {
    const marker = `${label}:`;
    const idx = raw.indexOf(marker);
    return { key, label, idx, marker };
  }).filter((item) => item.idx >= 0).sort((a, b) => a.idx - b.idx);

  if (indexes.length === 0) {
    fields.additionalNotes = raw;
    return { fields, isStructured: false, rawNotes: raw };
  }

  for (let i = 0; i < indexes.length; i += 1) {
    const current = indexes[i];
    const start = current.idx + current.marker.length;
    const end = i + 1 < indexes.length ? indexes[i + 1].idx : raw.length;
    const value = raw.slice(start, end).trim();
    fields[current.key] = value;
  }

  if (!fields.paymentTerms) {
    fields.paymentTerms = DEFAULT_PAYMENT_TERMS;
  }

  return { fields, isStructured: true, rawNotes: raw };
}

export function splitLines(value: string | null | undefined): string[] {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitBulletLines(value: string | null | undefined): string[] {
  return splitLines(value).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

export function parseBreakdownRows(value: string | null | undefined): Array<{
  qty: string;
  description: string;
  rate: string;
}> {
  return splitLines(value).map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length >= 3) {
      return {
        qty: parts[0],
        description: parts[1],
        rate: parts.slice(2).join(" | "),
      };
    }
    return {
      qty: "1x",
      description: line,
      rate: "",
    };
  });
}
