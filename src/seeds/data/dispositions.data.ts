export interface DispositionObjectiveOption {
  value: string;
  condition: string;
}

export interface DispositionSeed {
  slug: string;
  name: string;
  displayName: string;
  tag: string | null;
  question: string;
  systemPrompt: string | null;
  model: string;
  isSubjective: boolean;
  isObjective: boolean;
  subjectiveType: string;
  subjectiveTypeConfig: unknown | null;
  objectiveOptions: DispositionObjectiveOption[] | null;
  description: string | null;
  isActive: boolean;
  showInOverview: boolean;
  showInInsights: boolean;
}

export const dispositionsSeedData: DispositionSeed[] = [
  {
    slug: "real-estate-consultant-followup",
    name: "real_estate_consultant_followup",
    displayName: "Consultant Follow-up",
    tag: null,
    question:
      "What date, time, or time window did the customer specify for the consultant or human follow-up call?",
    systemPrompt:
      'Capture the date, time, or time window personally stated or confirmed by the customer for a follow-up call from a human sales consultant, advisor, relationship manager, or representative.\n\nReturn the agreed consultant callback schedule as a concise dynamic text value.\n\nExamples:\n\n"Ask the consultant to call me tomorrow." → Tomorrow\n"Someone can call me after 6 PM." → After 6 PM\n"Please ask your sales person to call on Saturday morning." → Saturday morning\n"Monday around 11 would be good." → Monday around 11 AM\n"Anytime next week is fine." → Next week\n"Ask them to call between 3 and 5." → Between 3 PM and 5 PM\n\nOnly capture a schedule when a consultant or human follow-up has been requested, accepted, or confirmed.\n\nDo not use the timing of a general callback if it is not specifically related to the consultant or human follow-up.\n\nDo not extract a date or time merely because the agent suggested it unless the customer clearly agrees.\n\nIf the customer agrees to a consultant follow-up but does not provide any specific date, time, or time window, return NOT_SHARED.\n\nIf multiple timings are discussed, capture the final confirmed consultant callback schedule.\n\nPreserve relative timing such as Tomorrow, Monday evening, or Next week unless your system separately performs absolute date normalization.\n\nReturn only the consultant callback schedule or NOT_SHARED. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "Yes",
        condition:
          "Return the agreed consultant callback schedule as a concise dynamic text value.",
      },
      {
        value: "No",
        condition:
          "If the customer agrees to a consultant follow-up but does not provide any specific date, time, or time window, return NOT_SHARED.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-consultant-callback-schedule",
    name: "real_estate_consultant_callback_schedule",
    displayName: "Consultant Follow-up Time",
    tag: null,
    question:
      'Determine whether the customer explicitly requested, agreed to, or clearly accepted a follow-up phone call from a human sales consultant, advisor, relationship manager, or other representative.\n\nReturn YES when the customer:\n\nasks to speak with a consultant or sales representative,\nagrees when the agent offers to arrange a consultant callback,\nasks for someone from the sales team to call,\nclearly accepts a human follow-up call.\n\nExamples:\n\n"Yes, ask your sales person to call me." → YES\n"Can someone explain this to me in detail?" and agrees to a consultant callback → YES\nAgent says "Shall I arrange a consultant call?" and customer says "Yes." → YES\n\nReturn NO when the customer explicitly declines a consultant or human callback.\n\nExamples:\n\n"No, I don\'t want anyone to call me." → NO\n"Just send the details, no need for a sales call." → NO\n\nReturn only YES or NO. Do not add explanations.',
    systemPrompt: null,
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: false,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: null,
    description:
      "Did the customer agree to receive a follow-up call from a human sales consultant, advisor, or representative?",
    isActive: true,
    showInOverview: false,
    showInInsights: true,
  },
  {
    slug: "general-callback-schedule",
    name: "general_callback_schedule",
    displayName: "Callback Time",
    tag: null,
    question:
      "Did the customer specify a preferred date, time, or time window for a callback?",
    systemPrompt:
      'Capture the callback date, time, or time window personally stated or confirmed by the customer.\n\nReturn the customer\'s requested callback schedule as a concise dynamic text value.\n\nExamples:\n\n"Call me tomorrow." → Tomorrow\n"Call me tomorrow evening." → Tomorrow evening\n"Call after 5 PM." → After 5 PM\n"Call me on Monday around 11." → Monday around 11 AM\n"Call next week." → Next week\n"Call me after lunch." → After lunch\n"Call me sometime between 4 and 6." → Between 4 PM and 6 PM\n\nCapture only a schedule stated or clearly agreed by the customer.\n\nDo not extract a date or time merely because the agent suggested it unless the customer clearly accepts or confirms it.\n\nIf the customer requests a callback but does not specify any date, time, or time window, return NOT_SHARED.\n\nIf multiple callback timings are discussed, capture the final confirmed callback schedule.\n\nDo not convert relative expressions such as "tomorrow", "next Monday", or "evening" into an absolute date unless the system separately provides and requires date normalization. Preserve the customer\'s intended timing.\n\nReturn only the callback schedule or NOT_SHARED. Do not add explanations',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: false,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: null,
    description: null,
    isActive: true,
    showInOverview: false,
    showInInsights: true,
  },
  {
    slug: "general-callback-required",
    name: "general_callback_required",
    displayName: "Callback Later",
    tag: null,
    question:
      "Did the customer ask to be called back later at any point during the conversation?",
    systemPrompt:
      'Determine whether the customer explicitly requested, agreed to, or clearly indicated that they should be contacted again by phone at a later time.\n\nReturn TRUE when the customer says or clearly implies any of the following:\n\n"Call me later."\n"Call me tomorrow."\n"Call me in the evening."\n"I\'m busy now, call me after some time."\n"Can you call me back?"\n"Speak to me next week."\n"Call after 5 PM."\nAny other clear request for a future phone callback.\n\nThe callback request may occur at any point during the conversation. It does not need to be the final outcome of the call.\n\nReturn TRUE even if another action is also agreed, for example:\n\ncustomer asks for details now and also asks for a callback tomorrow,\ncustomer agrees to a consultant follow-up and also asks to be called later,\ncustomer shows interest but requests another call at a more convenient time.\n\nDo not return TRUE when:\n\nthe agent merely offers to call later and the customer does not agree,\nthe customer asks for WhatsApp or email only,\nthe customer says they will call the company themselves,\nthe customer requests a site visit without asking for a callback,\nthere is no clear indication that another phone call is wanted.\n\nIf there is no clear callback request, leave the value empty.\n\nReturn only TRUE when applicable. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "boolean",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Return YES even if another action is also agreed, for example:  customer asks for details now and also asks for a callback tomorrow, customer agrees to a consultant follow-up and also asks to be called later, customer shows interest but requests another call at a more convenient time.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-customer-interest",
    name: "real_estate_customer_interest",
    displayName: "Interested Customers",
    tag: null,
    question:
      "Based on the customer's responses during the call, is the customer interested in the property, project, or real-estate opportunity being discussed or identified?",
    systemPrompt:
      "Review the customer's responses throughout the conversation and classify their interest as exactly one of:\n\nINTERESTED\nNOT_INTERESTED\nUNCLEAR\n\nDo not classify the customer as INTERESTED merely because they answered the call or confirmed that they are generally looking to purchase property.\n\nDo not classify the customer as NOT_INTERESTED merely because they have an objection regarding price, location, configuration, timing, or another requirement. If they continue exploring the opportunity despite the objection, evaluate the overall conversation.\n\nUse the customer's final position when their interest changes during the call.\n\nReturn exactly one value only. Do not add explanations.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "INTERESTED",
        condition:
          "Return INTERESTED when the customer clearly shows genuine interest in the property or project.",
      },
      {
        value: "NOT_INTERESTED",
        condition:
          "Return NOT_INTERESTED when the customer clearly indicates that they are not interested in the property or project being discussed.",
      },
      {
        value: "UNCLEAR",
        condition:
          "Return UNCLEAR when there is not enough evidence to reliably determine interest.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-preferred-property-type",
    name: "real_estate_preferred_property_type",
    displayName: "Property Type",
    tag: null,
    question: "What type of property is the customer looking for?",
    systemPrompt: null,
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      { value: "APARTMENT", condition: "I'm looking for an apartment." },
      { value: "VILLA", condition: "I prefer a villa." },
      { value: "PLOT", condition: "I'm looking for a residential plot." },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-property-purchase",
    name: "real_estate_property_purchase",
    displayName: "Looking for Property",
    tag: null,
    question:
      "Did the customer confirm that they are currently looking to buy a property?",
    systemPrompt:
      'Determine whether the customer confirms that they are currently looking for, considering, or planning to purchase a property.\n\nReturn TRUE when the customer gives a clear positive response indicating that they are looking to buy a property.\n\nExamples that should return TRUE:\n\n"Yes."\n"Yes, I\'m looking for a property."\n"I\'m looking for a flat."\n"We are planning to buy."\n"Yes, looking for a 3 BHK."\n"I\'m searching for a villa."\n"I am exploring some properties right now."\n"Maybe, I\'m looking at a few options." — if this clearly indicates they are actively considering a purchase.\n\nThe positive intent can be expressed at any point in the conversation; it does not have to be an exact response to the agent\'s initial question.\n\nDo not return TRUE merely because the customer discusses property prices, locations, configurations, or asks general questions. There must be reasonable evidence that the customer themselves is considering purchasing a property.\n\nDo not return TRUE when the customer clearly says:\n\nthey are not looking for a property,\nthey already completed their purchase and are no longer looking,\nthey are only a broker, agent, or channel partner and are not enquiring for their own property requirement,\nthe number belongs to the wrong person,\nthere is insufficient conversation to establish purchase intent.\n\nBecause this disposition is intended specifically to identify customers who positively confirmed property-purchase intent, if a positive confirmation is not present, leave the value empty.\n\nReturn only TRUE when applicable. Do not add explanations',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: false,
    subjectiveType: "boolean",
    subjectiveTypeConfig: null,
    objectiveOptions: null,
    description: null,
    isActive: true,
    showInOverview: false,
    showInInsights: true,
  },
  {
    slug: "general-language-support-required",
    name: "general_language_support_required",
    displayName: "Language Issue",
    tag: null,
    question:
      "Does the customer require support in a different language because they cannot comfortably continue the conversation in the language used by the agent?",
    systemPrompt:
      "Prompt\n\nDetermine whether the customer is unable or unwilling to continue the conversation because the agent does not support the customer's preferred language.\n\nReturn TRUE only when there is clear evidence of a language barrier, such as when the customer:\n\nasks the agent to speak in another language,\nsays they do not understand or are not comfortable with the language being used,\nrepeatedly responds in another language and is unable to meaningfully continue the conversation,\nindicates that they need someone who can speak their preferred language,\ncannot complete the conversation because the required language is not supported by the agent.\n\nDo not return TRUE merely because the customer:\n\nuses a few words or short phrases from another language,\nhas a non-English accent,\nswitches languages while still comfortably continuing the conversation,\nspeaks another language but still understands and communicates successfully with the agent.\n\nIf there is no clear language-support issue, leave the value empty.\n\nDo not return FALSE unless the system specifically requires a Boolean false value.\n\nReturn only TRUE when language support is required. Do not add explanations.",
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "boolean",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Return YES only when there is clear evidence of a language barrier",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "general-call-summary",
    name: "general_call_summary",
    displayName: "Call Summary",
    tag: null,
    question: "What are the most important facts and outcomes from this call?",
    systemPrompt:
      "Write a concise 2 to 4 sentence factual summary of the conversation from the customer's perspective.\n\nInclude, when available:\n\nthe customer's overall interest, intent, or purpose,\nimportant requirements, preferences, or needs mentioned,\nkey questions asked by the customer,\nobjections, concerns, limitations, or mismatches,\nany important decisions or confirmations made during the conversation,\nthe final next action agreed,\nany requested follow-up, callback, appointment, information sharing, escalation, or human assistance,\nany specific follow-up date, time, or preferred communication channel mentioned.\n\nPrioritize information that would help a business or operations team quickly understand what happened during the call, what the customer needs, and what should happen next.\n\nOnly include information explicitly stated, clearly confirmed, or directly supported by the conversation. Do not infer, assume, exaggerate, or add information that was not discussed.\n\nDo not summarize every part of the conversation. Focus on meaningful customer requirements, decisions, objections, commitments, and outcomes.\n\nIf information is corrected or clarified during the conversation, include only the final confirmed value. Mention the clarification only when it is important to understanding the outcome.\n\nIf the customer mentions multiple acceptable options or preferences, preserve that meaning rather than reducing it to a single option.\n\nIf the conversation ends before a meaningful discussion is completed, briefly state the relevant reason or outcome, such as the customer requesting a callback, not being interested, wrong contact, language barrier, call disconnection, insufficient conversation, or no meaningful response.\n\nDo not include internal system codes, disposition names, extraction labels, or classifications. Describe the outcome naturally in plain language.\n\nReturn only the summary. Do not add headings, bullet points, labels, or explanations.",
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: false,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: null,
    description: null,
    isActive: true,
    showInOverview: false,
    showInInsights: false,
  },
  {
    slug: "real-estate-next-action",
    name: "real_estate_next_action",
    displayName: "Next Action",
    tag: null,
    question:
      "What is the next action agreed with or requested by the customer at the during of the conversation?",
    systemPrompt:
      'Identify the single most appropriate next action based on what the customer explicitly requested, agreed to, or clearly accepted during the conversation.\n\nReturn one of these values:\n\nCONSULTANT_FOLLOWUP\nSITE_VISIT\nCALL_BACK_LATER\nSHARE_DETAILS\nNONE\n\nIf multiple next actions are discussed, return the one that represents the strongest or most immediate agreed next step at the end of the conversation.\n\nFor example:\n\nCustomer asks for brochure first and then agrees to speak with a consultant → CONSULTANT_FOLLOWUP\nCustomer asks for details and confirms a site visit → SITE_VISIT\nCustomer only asks to receive information → SHARE_DETAILS\nCustomer says "call me tomorrow" → CALL_BACK_LATER\n\nDo not infer a next action merely because the agent offered it. The customer must request, agree to, or clearly accept the action.\n\nReturn the value only. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "CONSULTANT_FOLLOWUP",
        condition:
          "Return CONSULTANT_FOLLOWUP when the customer agrees to or requests a follow-up conversation with a sales consultant, advisor, relationship manager, or similar human representative.",
      },
      {
        value: "SITE_VISIT",
        condition:
          "Return SITE_VISIT when the customer agrees to, requests, or clearly expresses intent to visit the project or property site.",
      },
      {
        value: "CALL_BACK_LATER",
        condition:
          "Return CALL_BACK_LATER when the customer asks to be contacted again at a later time, including when they are busy now or request another call later.",
      },
      {
        value: "SHARE_DETAILS",
        condition:
          "Return SHARE_DETAILS when the customer asks for project information, brochure, pricing, floor plans, location details, or other information to be sent to them.",
      },
      {
        value: "NONE",
        condition:
          "Return NONE when no clear next action is agreed or requested.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "general-channel-to-share-details",
    name: "general_channel_to_share_details",
    displayName: "Share Details",
    tag: null,
    question:
      "Which channel/medium did the customer request or agree to use for receiving or sharing the details?",
    systemPrompt:
      "Identify the communication channel through which the customer explicitly requested or agreed to receive information or details.\n\nReturn one of these values:\n\nWHATSAPP\nEMAIL\n\nDo not select a channel merely because the agent mentioned or offered it. The customer must explicitly request, choose, or clearly agree to that channel.\n\nIf both WhatsApp and email are clearly requested or accepted, return both values separated by a comma:\n\nWHATSAPP, EMAIL\n\nIf the customer asks for details but does not specify or agree to either WhatsApp or email, leave the value empty.\n\nDo not infer the preferred channel from the phone number, email address, previous communication, or any other context.\n\nReturn only the applicable value or values. Do not add explanations.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "WHATSAPP",
        condition:
          "Return WHATSAPP when the customer asks for or agrees to receive details through WhatsApp.",
      },
      {
        value: "EMAIL",
        condition:
          "Return EMAIL when the customer asks for or agrees to receive details through email.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-customer-location-preference",
    name: "real_estate_customer_location_preference",
    displayName: "Location Preferences",
    tag: null,
    question:
      "What location, area, neighbourhood, city, or region did the customer say they prefer for the property?",
    systemPrompt:
      'Capture the location preference personally stated or confirmed by the customer during the conversation.\n\nPreserve the customer\'s meaningful location requirement as dynamic text. This may include:\n\nlocality or neighbourhood,\nnearby landmark,\nroad or corridor,\ncity,\nregion,\npreferred side of the city,\nmultiple acceptable locations,\ndistance or proximity requirement when relevant.\n\nExamples:\n\n"I am looking near Whitefield" → Whitefield\n"Somewhere around Sarjapur Road" → Sarjapur Road\n"Either Kanakapura Road or Bannerghatta Road" → Kanakapura Road or Bannerghatta Road\n"I want something close to Electronic City, within around 5 km" → Within around 5 km of Electronic City\n"South Bangalore is preferred" → South Bangalore\n"Anywhere between Mysore Road and Kengeri is fine" → Mysore Road to Kengeri area\n\nCapture only the customer\'s preference. Do not return the project location merely because the agent mentioned it.\n\nIf the customer changes or corrects their preferred location during the call, capture the final confirmed preference.\n\nIf the customer mentions multiple acceptable locations, preserve all relevant locations in one concise text value.\n\nIf the customer does not state or confirm any location preference, return NOT_SHARED.\n\nReturn only the extracted location text or NOT_SHARED. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: false,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: null,
    description: null,
    isActive: true,
    showInOverview: false,
    showInInsights: true,
  },
  {
    slug: "real-estate-location-mismatch",
    name: "real_estate_location_mismatch",
    displayName: "Looking at Different Location",
    tag: null,
    question:
      "Is the customer looking for a property in a different location from the project being discussed?",
    systemPrompt:
      "Determine whether the customer clearly indicates that they are looking for a property in a different location, area, neighbourhood, city, or region from the project location being discussed in the call.\n\nReturn YES when the customer:\n\nexplicitly says they prefer another location,\nsays the current project location is not suitable and mentions or implies another location,\nasks specifically for properties in a different area,\nindicates that they are only interested in another location.\n\nDo not return YES merely because the customer:\n\nasks about connectivity, nearby areas, or landmarks,\ncompares the project location with another area,\nasks whether there are projects in other locations without expressing a preference,\nsays the current location is acceptable but also mentions another area,\ndoes not mention any location preference.\n\nIf there is no clear evidence that the customer prefers a different location, leave the value empty.\n\nReturn only YES when applicable. Do not return an explanation.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Return YES when the customer:  explicitly says they prefer another location, says the current project location is not suitable and mentions or implies another location, asks specifically for properties in a different area, indicates that they are only interested in another location.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-purchase-timeline",
    name: "real_estate_purchase_timeline",
    displayName: "Purchase Timeline",
    tag: null,
    question: "When is the customer planning to purchase a property?",
    systemPrompt:
      'Identify the customer\'s stated or clearly indicated timeline for purchasing a property.\n\nReturn one of these values:\n\nWITHIN_3_MONTHS\nWITHIN_6_MONTHS\nWITHIN_1_YEAR\nAFTER_1_YEAR\nFLEXIBLE\nNOT_DECIDED\n\nUse the customer\'s own stated timeframe or intent.\n\nClassification guidance:\n\nExamples:\n\n"I want to buy in the next two months" → WITHIN_3_MONTHS\n"Maybe around four or five months from now" → WITHIN_6_MONTHS\n"Sometime later this year" → WITHIN_1_YEAR, if the timing clearly falls within one year\n"Probably after one or two years" → AFTER_1_YEAR\n"No fixed timeline, if I find something good I can proceed" → FLEXIBLE\n"I haven\'t thought about when to buy yet" → NOT_DECIDED\n\nUse only the customer\'s purchase timeline. Do not infer it from project possession dates, payment plans, loan availability, agent suggestions, or other contextual information.\n\nIf the customer changes or clarifies the timeline during the conversation, use the final confirmed timeline.\n\nReturn the value only. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "WITHIN_3_MONTHS",
        condition:
          "customer plans to purchase immediately, within a few weeks, or within 3 months.",
      },
      {
        value: "WITHIN_6_MONTHS",
        condition:
          "customer plans to purchase after 3 months but within 6 months.",
      },
      {
        value: "WITHIN_1_YEAR",
        condition: "Customer said within a year or by end of year",
      },
      {
        value: "AFTER_1_YEAR",
        condition:
          "customer clearly says the purchase is planned more than one year later.",
      },
      {
        value: "FLEXIBLE",
        condition:
          "customer is open to purchasing whenever the right property or opportunity is found and does not have a fixed timeline.",
      },
      {
        value: "NOT_DECIDED",
        condition:
          "customer is unsure, has not decided, or does not provide enough information to determine a purchase timeline.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-preferred-configuration",
    name: "real_estate_preferred_configuration",
    displayName: "Preferred Configuration",
    tag: null,
    question: "What property configuration is the customer looking for?",
    systemPrompt:
      'Identify the property configuration or configurations the customer personally stated or confirmed they are interested in.\n\nWhen the customer\'s requirement clearly matches one of the standard configurations below, return the corresponding objective key:\n\nSTUDIO\n1_BHK\n2_BHK\n3_BHK\n4_BHK\n5_BHK\n6_BHK\n\nTreat obvious spoken or transcription variants such as 3BHK, 3 BHK, three BHK, three bedroom, or three-bedroom flat as the same standard configuration.\n\nIf the customer mentions multiple standard configurations, return all applicable objective keys separated by a comma.\n\nExamples:\n\n"I\'m looking for 2 or 3 BHK." → 2_BHK, 3_BHK\n"Either a 4 bedroom or 5 bedroom home." → 4_BHK, 5_BHK\n"I need a studio apartment." → STUDIO\n\nIf the customer gives additional meaningful requirements beyond the standard configuration, preserve the full requirement as dynamic text instead of reducing it to only the objective key.\n\nExamples:\n\n"I need a 3 BHK with office room." → 3 BHK with office room\n"Looking for a 4 BHK duplex." → 4 BHK duplex\n"I need a 6 BHK duplex villa." → 6 BHK duplex villa\n\nIf the customer mentions a configuration outside the standard list, preserve it as dynamic text.\n\nExamples:\n\n"I need a 7 BHK." → 7 BHK\n"I\'m looking for a 2.5 BHK." → 2.5 BHK\n"I need a 3 bedroom plus study." → 3 bedroom plus study\n\nUse only the customer\'s stated or confirmed requirement. Do not extract a configuration merely because the agent mentions that it is available.\n\nIf the customer changes or corrects their requirement, capture the final confirmed requirement.\n\nDo not infer the configuration from budget, family size, project inventory, or any other information.\n\nIf no configuration is stated or confirmed, return NOT_SHARED.\n\nReturn only the extracted value. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "STUDIO",
        condition:
          "studio, studio apartment, 1 RK, one-room kitchen, or equivalent studio-style unit.",
      },
      {
        value: "1_BHK",
        condition: "1 BHK, one BHK, one-bedroom apartment/flat/home.",
      },
      {
        value: "2_BHK",
        condition: "2 BHK, two BHK, two-bedroom apartment/flat/home.",
      },
      {
        value: "3_BHK",
        condition: "3 BHK, three BHK, three-bedroom apartment/flat/home.",
      },
      {
        value: "4_BHK",
        condition: "4 BHK, four BHK, four-bedroom apartment/flat/home.",
      },
      {
        value: "5_BHK",
        condition: "5 BHK, five BHK, five-bedroom apartment/flat/home.",
      },
      {
        value: "6_BHK",
        condition: "6 BHK, six BHK, six-bedroom apartment/flat/home.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: true,
  },
  {
    slug: "real-estate-purchase-purpose",
    name: "real_estate_purchase_purpose",
    displayName: "Purchase Purpose",
    tag: null,
    question:
      "What is the customer's primary purpose for purchasing the property?",
    systemPrompt:
      'Identify the customer\'s stated or clearly confirmed purpose for purchasing the property.\n\nReturn exactly one of these values:\n\nOWN_USE\nINVESTMENT\nBOTH\n\nExamples:\n\n"I\'m buying this for my family to stay." → OWN_USE\n"This is for my own residence." → OWN_USE\n"I\'m looking mainly for investment." → INVESTMENT\n"I want something with good rental returns." → INVESTMENT\n"I\'m buying now as an investment, but I may use it myself later." → BOTH\n"I\'m considering it for both living and investment." → BOTH\n\nUse only the customer\'s own stated or confirmed purchase purpose.\n\nDo not infer the purpose from:\n\nthe customer\'s budget,\nproperty type,\nlocation,\nprofession or income,\nwhether they currently own another property,\nexpected rental yield,\ncomments made only by the agent.\n\nIf the customer changes or clarifies their purpose during the conversation, use the final confirmed purpose.\n\nIf the customer does not state or confirm a purchase purpose, return NOT_SHARED.\n\nReturn only the value. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "OWN_USE",
        condition:
          "the customer is purchasing primarily to live in the property themselves or for their family.",
      },
      {
        value: "INVESTMENT",
        condition:
          "the customer is purchasing primarily as an investment, for capital appreciation, rental income, resale, or another investment purpose.",
      },
      {
        value: "BOTH",
        condition:
          "the customer clearly indicates that the property is intended for both personal use and investment purposes, or they are genuinely considering both.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-budget-range",
    name: "real_estate_budget_range",
    displayName: "Budget Range",
    tag: null,
    question:
      "What budget range did the customer personally state or indicate for the property purchase?",
    systemPrompt:
      'Identify the customer\'s own stated property budget or budget range.\n\nUse the predefined values when the customer\'s requirement clearly fits one of these ranges:\n\nBELOW_1_CR\n1_TO_2_CR\n2_TO_3_CR\nABOVE_3_CR\n\nIf the customer gives a more specific, approximate, multiple, flexible, or otherwise meaningful budget that should not be reduced to a broad predefined range, preserve the customer\'s requirement as dynamic text.\n\nExamples:\n\n"My budget is around 80 lakhs" → BELOW_1_CR\n"I can spend between 1.2 and 1.5 crore" → 1_TO_2_CR\n"Around 2.5 crore" → 2_TO_3_CR\n"Anything above 3 crore is fine" → ABOVE_3_CR\n"Around 1 crore, maybe slightly more if the project is good" → Around 1 crore, flexible slightly above\n"I am looking between 90 lakhs and 1.1 crore" → 90 lakhs to 1.1 crore\n"For an apartment I can spend 1.5 crore, but for a villa up to 2.5 crore" → Apartment: 1.5 crore; Villa: up to 2.5 crore\n\nCapture only the budget stated or confirmed by the customer.\n\nDo not use the project price, unit price, offer price, EMI amount, loan eligibility, or any pricing information mentioned only by the agent as the customer\'s budget.\n\nIf the customer initially states one budget and later changes, corrects, or expands it, capture the final confirmed requirement.\n\nDo not infer a budget from the customer\'s profession, income, preferred configuration, location, or other information.\n\nIf the customer says the budget is flexible without providing any amount, return FLEXIBLE.\n\nIf the customer does not state or confirm any budget information, return NOT_SHARED.\n\nReturn only the extracted value. Do not add explanations.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: false,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: null,
    description: null,
    isActive: true,
    showInOverview: false,
    showInInsights: false,
  },
  {
    slug: "general-do-not-call",
    name: "general_do_not_call",
    displayName: "Do Not Call",
    tag: null,
    question: "Did the customer request not to be contacted again?",
    systemPrompt:
      "Determine whether the customer explicitly asked not to receive further calls or contact.\n\nReturn YES if the customer said or clearly indicated any of the following:\n\nDo not call again.\nRemove my number from your list.\nStop contacting me.\nI do not want any further calls.\nDo not contact me again through this number.\nAny other clear request to stop future communication.\n\nReturn NO if the customer did not make such a request.\n\nDo not return YES merely because the customer:\n\nis not interested,\nis busy,\nasks to be called later,\ndisconnects the call,\nrefuses the current offer,\nsays they already purchased elsewhere.\n\nOnly classify as YES when there is a clear request to stop future contact.\n\nReturn the value only: YES or NO.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition: "Customer explicitly requested no further calls",
      },
      { value: "NO", condition: "No such request was made" },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "general-customer-language",
    name: "general_customer_language",
    displayName: "Customer Language",
    tag: null,
    question: "What primary language was the customer speaking?",
    systemPrompt:
      "Identify the primary language spoken by the customer during the conversation. Determine the language based only on the customer's speech, not the agent's speech. Return one of: ENGLISH, MALAYALAM, HINDI, KANNADA, TAMIL, TELUGU, OTHER, NON_ENGLISH_UNIDENTIFIED, NOT_DETERMINED. If the customer predominantly speaks one identifiable language, return that language. If the customer repeatedly speaks a non-English language but it cannot be reliably identified, return NON_ENGLISH_UNIDENTIFIED. If there is insufficient customer speech to determine the language, return NOT_DETERMINED. Return the value only.",
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "Non-English",
        condition: "Customer needed a language other than English",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-lead-temperature",
    name: "real_estate_lead_temperature",
    displayName: "Lead Temperature",
    tag: null,
    question:
      "What is the lead temperature of the customer based on their overall buying intent, urgency, engagement, and agreed next action?",
    systemPrompt:
      "Review the entire conversation and classify the customer into exactly one of the following lead temperatures:\n\n\nUse the customer's final state when their behaviour changes during the conversation.\n\nDo not classify a lead as HOT only because they asked many questions. There must also be strong buying intent, urgency, or a meaningful next step.\n\nDo not classify a lead as WARM simply because they said \"yes\" to looking for a property. There should be genuine engagement or qualification.\n\nDo not classify a lead as COLD when the customer is merely busy, asks for a callback, or has a long purchase timeline. Use NURTURE when future buying interest still exists.\n\nIf both HOT and WARM indicators are present, prefer HOT only when there is a clear near-term action or strong purchase urgency.\n\nIf both WARM and NURTURE indicators are present, use the customer's purchase readiness and timeline as the deciding factor:\n\nactively evaluating with reasonable near-term intent → WARM\ngenuine interest but clearly not ready soon → NURTURE\n\nReturn exactly one value only. Do not add explanations.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "WARM",
        condition:
          "Return WARM when the customer has genuine interest and is actively evaluating the opportunity, but is not yet ready for an immediate purchase decision.",
      },
      {
        value: "HOT",
        condition:
          "Return HOT when the customer shows strong and actionable buying intent and is ready for an immediate or near-term next step.",
      },
      {
        value: "NURTURE",
        condition:
          "Return NURTURE when the customer has some genuine property-buying interest but is not ready to act in the near future.",
      },
      {
        value: "COLD",
        condition:
          "Return COLD when the customer is a genuine prospect but clearly has little or no interest in the current opportunity.",
      },
      {
        value: "NOT_APPLICABLE",
        condition:
          "Return NOT_APPLICABLE when lead temperature cannot meaningfully be assigned because the call did not involve a valid or qualifiable prospect.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-final-outcome",
    name: "real_estate_final_outcome",
    displayName: "Final Outcome",
    tag: null,
    question: "What was the final outcome of the call?",
    systemPrompt:
      "Review the entire conversation and determine the single most appropriate final outcome based on how the call ended and what the customer ultimately requested, agreed to, or clearly indicated.\n\nWhen more than one outcome applies, return the outcome that best represents the final and most meaningful state of the call.\n\nUse this priority guidance when needed:\n\nDO_NOT_CALL\ntakes priority over any other outcome if the customer explicitly requests no further contact.\n\nSITE_VISIT\ntakes priority when a site visit is actually agreed, even if details will also be shared.\n\nCONSULTANT_FOLLOWUP\ntakes priority when a consultant follow-up is the agreed next step.\n\nCALLBACK_REQUESTED\ntakes priority when the customer asks to continue the conversation at another time and no stronger next action is agreed.\n\nSHARE_DETAILS\napplies when sharing information is the primary agreed next step.\n\nDo not classify based only on what the agent proposed. Base the outcome on the customer's final response and the actual state of the conversation.\n\nReturn one value only. Do not add explanations.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "SITE_VISIT",
        condition:
          "customer agrees to or requests a property/project site visit.",
      },
      {
        value: "CONSULTANT_FOLLOWUP",
        condition:
          "customer wants or agrees to speak with a sales consultant, advisor, relationship manager, or other human representative.",
      },
      {
        value: "CALLBACK_REQUESTED",
        condition:
          "customer asks to be called again later, including when they are busy or unavailable at the moment.",
      },
      {
        value: "SHARE_DETAILS",
        condition:
          "customer asks for project information such as brochure, pricing, floor plan, location, availability, or similar details to be sent.",
      },
      {
        value: "INTERESTED_NO_ACTION",
        condition:
          "customer shows genuine interest, but no specific next action is agreed or requested.",
      },
      {
        value: "NOT_INTERESTED",
        condition:
          "customer clearly indicates that they are not interested in the property, project, or offer.",
      },
      {
        value: "DO_NOT_CALL",
        condition:
          "customer explicitly asks not to be called or contacted again, or asks to be removed from the contact list.",
      },
      {
        value: "ALREADY_PURCHASED",
        condition:
          "customer says they have already purchased or finalized another property and are therefore no longer looking.",
      },
      {
        value: "BROKER_OR_CHANNEL_PARTNER",
        condition:
          "the person identifies themselves as a broker, agent, channel partner, or intermediary rather than an end customer/prospect.",
      },
      {
        value: "LANGUAGE_ISSUE",
        condition:
          "the conversation cannot meaningfully continue because the customer requires a language that the agent cannot support.",
      },
      {
        value: "WRONG_NUMBER",
        condition:
          "the person says the number is incorrect, the intended customer is not associated with the number, or the agent clearly reached the wrong person.",
      },
      {
        value: "NO_RESPONSE",
        condition:
          "the call connects but no meaningful customer response is received, such as silence, unanswered interaction, or no usable customer speech.",
      },
      {
        value: "CALL_DROPPED",
        condition:
          "a meaningful conversation begins but the call disconnects or ends unexpectedly before a clear outcome is reached.",
      },
      {
        value: "INSUFFICIENT_CONVERSATION",
        condition:
          "there is some interaction, but not enough meaningful conversation to determine the customer's intent or a valid outcome.",
      },
      {
        value: "OTHER",
        condition:
          "The conversation has a clear outcome that does not reasonably fit any of the defined values.",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
];
