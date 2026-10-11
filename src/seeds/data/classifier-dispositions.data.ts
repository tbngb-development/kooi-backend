import type { ClassifierQuestionType } from "@prisma/client";

export interface ClassifierObjectiveOption {
  value: string;
  condition: string;
}

export interface ClassifierDispositionSeed {
  slug: string;
  name: string;
  displayName: string;
  question: string;
  questionType: ClassifierQuestionType;
  objectiveOptions: ClassifierObjectiveOption[];
  industryPackSlug: string | null; // null = General (any industry)
  isActive: boolean;
}

export const classifierDispositionsSeedData: ClassifierDispositionSeed[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // GENERAL CLASSIFIERS (industryPackSlug = null)
  // ─────────────────────────────────────────────────────────────────────────

  {
    slug: "general-customer-language",
    name: "general_customer_language",
    displayName: "Customer Language",
    question: "What language is the customer primarily speaking during the call?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "ENGLISH",
        condition:
          "Return English when the customer predominantly communicates in English during the conversation. Do not return English merely because the customer uses a few English words or phrases.",
      },
      {
        value: "MALAYALAM",
        condition:
          "Return Malayalam when the customer predominantly communicates in Malayalam.",
      },
      {
        value: "HINDI",
        condition:
          "Return Hindi when the customer predominantly communicates in Hindi.",
      },
      {
        value: "KANNADA",
        condition:
          "Return Kannada when the customer predominantly communicates in Kannada.",
      },
      {
        value: "TAMIL",
        condition:
          "Return Tamil when the customer predominantly communicates in Tamil.",
      },
      {
        value: "TELUGU",
        condition:
          "Return Telugu when the customer predominantly communicates in Telugu.",
      },
      {
        value: "NON_ENGLISH_UNIDENTIFIED",
        condition:
          "Return NON_ENGLISH_UNIDENTIFIED when there is clear evidence that the customer is speaking a non-English language, but the specific language cannot be identified reliably. Use this only when there are multiple meaningful customer utterances indicating a non-English language. Do not use this when there is too little speech to determine whether the language is English or non-English.",
      },
      {
        value: "NOT_DETERMINED",
        condition:
          "Return NOT_DETERMINED when there is insufficient usable customer speech to reliably identify the language. Examples include: - only a very short response, - mostly silence, - call disconnects almost immediately, - speech is too unclear or incomplete to identify the language. Do not use NOT_DETERMINED when it is clear that the customer is speaking a non-English language but the exact language is unknown; use NON_ENGLISH_UNIDENTIFIED instead.",
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-do-not-call",
    name: "general_do_not_call",
    displayName: "Do Not Call",
    question: "Did the customer clearly ask not to be contacted or called again?",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'Return YES only when the customer clearly requests that future calls. Examples: - "Do not call me again." - "Please remove my number from your list." - "I don\'t want any more calls." - "Don\'t contact me again." - "Please delete my number." - "No more calls from your company." Do not return YES for statements such as: - "Not now." - "I\'m busy." - "Call me later." - "I already bought a property." If the condition is not clearly met, return NO_DATA value',
      },
      {
        value: "NO_DATA",
        condition:
          'Only when we didn\'t receive any other objective values or customer didn\'t share or discuss about this disposition.  Also return DO_DATA when customer says like: - "I\'m not interested." - "Not now." - "I\'m busy." - "Call me later." - "I already bought a property."',
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-channel-to-share-details",
    name: "general_channel_to_share_details",
    displayName: "Share Details",
    question: "Which communication channel did the customer clearly request or agree to use for receiving the details?",
    questionType: "MULTI_CHOICE",
    objectiveOptions: [
      {
        value: "WHATSAPP",
        condition:
          'Return WHATSAPP only when the customer explicitly requests or clearly agrees to receive the details through WhatsApp. Examples: - "Send it on WhatsApp." - "You can WhatsApp me the brochure." - Agent asks, "Can I send the details on WhatsApp?" and the customer clearly agrees. Do not return WHATSAPP merely because the agent says they will send the details on WhatsApp without customer confirmation.',
      },
      {
        value: "EMAIL",
        condition:
          'Return EMAIL only when the customer explicitly requests or clearly agrees to receive the details through email. Examples: - "Please email me the details." - "Send the brochure to my email." - Agent asks whether the details can be emailed and the customer clearly agrees. Do not return EMAIL merely because an email address is available or the agent mentions email.',
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-language-support-required",
    name: "general_language_support_required",
    displayName: "Language Issue",
    question: "Does the customer require support in a different language because they cannot comfortably continue the conversation in the language used by the agent?",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Return YES only when the customer clearly needs another language in order to continue the conversation. Examples include: - the customer asks the agent to speak in another language, - the customer says they do not understand or are not comfortable with the current language, - the customer repeatedly responds in another language and meaningful conversation cannot continue, - the customer asks for someone who can speak their preferred language, - the call cannot progress because of the language barrier. Do not return YES when the customer merely uses another language occasionally but still understands and communicates successfully.",
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-callback-required",
    name: "general_callback_required",
    displayName: "Callback Later",
    question: "Did the customer clearly ask to call back later?",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'Only when the customer explicitly requests or clearly agrees to another phone call at a later time. Examples: - "Call me later." - "Call me tomorrow." - "Call me after 10 minutes" - "I\'m busy now, call me in the evening." - "Can you call me back?" - "Call after 5 PM." - "Speak to me next week." - Agent: "Shall I call you later?" Customer: "Yes." If the condition is not clearly met, return no value. Do not return YES when the customer only agrees to a human consultant or sales representative follow-up. That should be captured separately under the consultant follow-up disposition.',
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REAL ESTATE CLASSIFIERS (industryPackSlug = "real-estate")
  // ─────────────────────────────────────────────────────────────────────────

  {
    slug: "real-estate-final-outcome",
    name: "real_estate_final_outcome",
    displayName: "Final Outcome",
    question: "What single outcome best represents how the call ultimately ended?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "SITE_VISIT",
        condition:
          'Return SITE_VISIT when the customer clearly requests, agrees to, or confirms a visit to the property, project, sales office, model unit, or site. Examples: - "I\'ll visit this Saturday." - "Can I come and see the project?" - Customer accepts a proposed site visit. If details or a consultant conversation are also part of arranging the visit, use SITE_VISIT when the site visit is the primary committed next step.',
      },
      {
        value: "CONSULTANT_FOLLOWUP",
        condition:
          'Return CONSULTANT_FOLLOWUP when the customer clearly requests or agrees to a follow-up call from a human consultant, sales representative, relationship manager, advisor, or equivalent person. Examples: - "Ask your sales person to call me." - "I\'d like to speak with a consultant." - Customer accepts the agent\'s offer to arrange a consultant call. If details are also being shared but the customer has agreed to a consultant conversation, use CONSULTANT_FOLLOWUP.',
      },
      {
        value: "CALLBACK_REQUESTED",
        condition:
          'Return CALLBACK_REQUESTED when the customer\'s primary outcome is a request to be called again later. Examples: - "I\'m busy. Call me this evening." - "Call me tomorrow." - "Can you call back later?" Use this for a general callback. If the customer specifically agrees to a human consultant or sales representative call, use CONSULTANT_FOLLOWUP instead.',
      },
      {
        value: "SHARE_DETAILS",
        condition:
          'Return SHARE_DETAILS when the primary agreed next action is to send the customer information such as a brochure, pricing, floor plans, availability, project details, location details, or similar material. Examples: - "Send me the brochure on WhatsApp." - "Please email the price details." - Customer agrees to receive project information and no stronger next action is agreed. Do not return SHARE_DETAILS merely because the agent says they will send information without customer agreement. If a stronger action such as a site visit or consultant follow-up is subsequently agreed, use that stronger final outcome instead.',
      },
      {
        value: "INTERESTED_NO_ACTION",
        condition:
          "Return INTERESTED_NO_ACTION when the customer clearly demonstrates genuine interest in the project or opportunity, but no specific next action is requested or agreed. Examples: - customer meaningfully discusses their requirements and expresses interest but says they will think about it, - customer says the project sounds interesting but does not request details, callback, consultant follow-up, or site visit. Do not use this simply because the customer is generally looking for property. There must be clear interest in the opportunity being discussed.",
      },
      {
        value: "NOT_INTERESTED",
        condition:
          'Return NOT_INTERESTED when the customer clearly states or demonstrates that they are not interested in the project or opportunity being discussed. Examples: - "I\'m not interested." - "This project isn\'t suitable for me." - "No thanks, I\'m not considering this." Do not use NOT_INTERESTED merely because the customer is busy, has an objection, prefers another location, or has a long purchase timeline while remaining interested. If the customer also explicitly asks not to receive future contact, use DO_NOT_CALL instead.',
      },
      {
        value: "DO_NOT_CALL",
        condition:
          'Return DO_NOT_CALL when the customer explicitly asks not to be called or contacted again, or asks to be removed from the contact list. Examples: - "Don\'t call me again." - "Remove my number." - "Stop contacting me." This takes precedence over NOT_INTERESTED.',
      },
      {
        value: "ALREADY_PURCHASED",
        condition:
          'Return ALREADY_PURCHASED when the customer clearly states that they have already purchased or finalized another property and are no longer looking because of that purchase. Examples: - "I\'ve already bought a flat." - "We finalized another property last month." Do not use this merely because the customer already owns another property. The statement should indicate that an existing/recent purchase makes the current opportunity no longer relevant.',
      },
      {
        value: "BROKER_OR_CHANNEL_PARTNER",
        condition:
          "Return BROKER_OR_CHANNEL_PARTNER when the person identifies themselves as a broker, property agent, channel partner, intermediary, or similar industry professional rather than the intended end-customer prospect. Do not infer this from the person's questions or real-estate knowledge alone.",
      },
      {
        value: "LANGUAGE_ISSUE",
        condition:
          "Return LANGUAGE_ISSUE when the conversation cannot meaningfully continue or be qualified because the customer requires a language that the agent cannot support. Examples: - customer asks for another language and the agent cannot continue in it, - meaningful communication repeatedly fails because of the language barrier. Do not use this merely because the customer speaks another language if the conversation successfully continues.",
      },
      {
        value: "WRONG_NUMBER",
        condition:
          'Return WRONG_NUMBER when there is clear evidence that the call reached the wrong person or an incorrect/unrelated phone number. Examples: - "You have the wrong number." - "There is nobody by that name here." - recipient clearly confirms they are unrelated to the intended customer. Do not use this simply because the recipient is not interested.',
      },
      {
        value: "NO_RESPONSE",
        condition:
          "Return NO_RESPONSE when the call connects but there is no meaningful customer response. Examples: - silence throughout the interaction, - repeated agent attempts receive no usable response, - no meaningful customer speech is captured. Do not use NO_RESPONSE if the customer actually begins a meaningful conversation before the call disconnects.",
      },
      {
        value: "CALL_DROPPED",
        condition:
          'Return CALL_DROPPED when a meaningful conversation has started but the call unexpectedly disconnects before a clear final outcome is reached. Do not use this just because the customer intentionally ends the call after clearly communicating an outcome. Example: Customer: "I\'m not interested." disconnects → NOT_INTERESTED, not CALL_DROPPED. Customer is discussing requirements and the connection suddenly ends before any outcome is established → CALL_DROPPED.',
      },
      {
        value: "INSUFFICIENT_CONVERSATION",
        condition:
          "When some customer interaction occurs, but there is not enough meaningful conversation to determine another valid final outcome. Examples: - customer gives one or two ambiguous responses and ends the call, - extremely short interaction without clear intent, - conversation starts but never progresses enough to establish interest or another outcome. Distinguish this from: - no meaningful customer response at all → NO_RESPONSE - meaningful conversation interrupted unexpectedly → CALL_DROPPED",
      },
      {
        value: "OTHER",
        condition:
          "Only when the conversation has a clear and meaningful final outcome that does not reasonably match any other configured final-outcome value. Do not use OTHER simply because the outcome is unclear. If there is insufficient information, use INSUFFICIENT_CONVERSATION.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-lead-temperature",
    name: "real_estate_lead_temperature",
    displayName: "Lead Temperature",
    question: "What is the customer's lead temperature based on their overall buying intent, engagement, purchase readiness, and next-step commitment?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "HOT",
        condition:
          'Return HOT when the customer shows strong buying intent and is ready for an immediate or near-term action. Typical indicators: - agrees to or requests a site visit, - wants to speak with a consultant soon, - has a near-term purchase timeline, - discusses specific requirements and wants to proceed, - asks about booking, availability, negotiation, payment, or immediate next steps. Examples: - "I want to visit this weekend." - "Ask your consultant to call me today." - "I\'m planning to buy within two months."',
      },
      {
        value: "WARM",
        condition:
          'Return WARM when the customer shows genuine interest and is actively evaluating the opportunity but is not yet ready for an immediate decision. Typical indicators: - shares meaningful requirements, - asks relevant project questions, - requests details, - agrees to follow-up, - compares the project with other options, - has a realistic medium-term purchase intention. Examples: - "Send me the brochure, I\'m comparing a few projects." - "I\'m looking for a 3 BHK around this budget." - "I may buy within six months."',
      },
      {
        value: "NURTURE",
        condition:
          'Return NURTURE when the customer has genuine future buying potential but is not ready to act in the near term. Typical indicators: - purchase planned after a long period, - early-stage research, - waiting for finances, family decision, job change, market conditions, or another future event, - interested but not currently ready to proceed. Examples: - "Maybe next year." - "I\'m just exploring for now." - "I\'m interested, but I won\'t buy anytime soon." Use NURTURE instead of COLD when future purchase intent still exists.',
      },
      {
        value: "COLD",
        condition:
          'Return COLD when the customer is a genuine prospect but clearly has little or no interest in the current opportunity. Typical indicators: - clearly says they are not interested, - rejects the project, - says the opportunity is unsuitable and does not want to continue, - does not want further information or follow-up. Examples: - "I\'m not interested." - "This project is not for me." - "The location doesn\'t work for me, so I\'m not considering it." Do not use COLD for calls that never reached a genuine prospect.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-budget-range",
    name: "real_estate_budget_range",
    displayName: "Budget Range",
    question: "What budget range did the customer personally state or indicate for the property purchase?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "BELOW_1_CR",
        condition:
          'Only when the customer clearly states or confirms a budget below ₹1 crore. Examples: - "Around 70 lakhs." - "My budget is 90 lakhs." - "Below one crore."',
      },
      {
        value: "1_TO_2_CR",
        condition:
          'Only when the customer\'s clearly stated budget falls from ₹1 crore up to ₹2 crore. Examples: - "Around 1.2 crore." - "My budget is 1.5 crore." - "Between 1 and 2 crore."',
      },
      {
        value: "2_TO_3_CR",
        condition:
          'Only when the customer\'s clearly stated budget falls above ₹2 crore and up to ₹3 crore. Examples: - "Around 2.5 crore." - "My budget is 2.8 crore." - "Between 2 and 3 crore."',
      },
      {
        value: "ABOVE_3_CR",
        condition:
          'Only when the customer clearly states or confirms a budget above ₹3 crore. Examples: - "Around 4 crore." - "Anything above 3 crore is fine." - "My budget can go up to 5 crore."',
      },
      {
        value: "FLEXIBLE",
        condition:
          "Return when the customer explicitly says their budget is flexible, negotiable, or not strictly limited to a specific range.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-purchase-purpose",
    name: "real_estate_purchase_purpose",
    displayName: "Purchase Purpose",
    question: "Did the customer state or confirm whether they are buying the property for personal use, investment, or both?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "OWN_USE",
        condition:
          "Return when the customer says they are buying for themselves, their family, or to live in the property.",
      },
      {
        value: "INVESTMENT",
        condition:
          "Return when the customer says they are buying for investment, rental income, resale, or appreciation.",
      },
      {
        value: "BOTH",
        condition:
          "Return when the customer explicitly states they are buying for both personal use and investment.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-preferred-configuration",
    name: "real_estate_preferred_configuration",
    displayName: "Preferred Configuration",
    question: "What property configuration is the customer looking for?",
    questionType: "MULTI_CHOICE",
    objectiveOptions: [
      {
        value: "STUDIO",
        condition:
          "Return STUDIO only when the customer clearly states or confirms that they are looking for a studio, studio apartment, 1 RK, or an equivalent studio-type configuration",
      },
      {
        value: "1_BHK",
        condition:
          "Return 1_BHK only when the customer clearly states or confirms that they are looking for a 1 BHK, one-bedroom, or equivalent configuration.",
      },
      {
        value: "2_BHK",
        condition:
          "Return 2_BHK only when the customer clearly states or confirms that they are looking for a 2 BHK, two-bedroom, or equivalent configuration.",
      },
      {
        value: "3_BHK",
        condition:
          "Return 3_BHK only when the customer clearly states or confirms that they are looking for a 3 BHK, three-bedroom, or equivalent configuration.",
      },
      {
        value: "4_BHK",
        condition:
          "Return 4_BHK only when the customer clearly states or confirms that they are looking for a 4 BHK, four-bedroom, or equivalent configuration.",
      },
      {
        value: "5_BHK",
        condition:
          "Return 5_BHK only when the customer clearly states or confirms that they are looking for a 5 BHK, five-bedroom, or equivalent configuration.",
      },
      {
        value: "6_BHK",
        condition:
          "Return 6_BHK only when the customer clearly states or confirms that they are looking for a 6 BHK, six-bedroom, or equivalent configuration.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-purchase-timeline",
    name: "real_estate_purchase_timeline",
    displayName: "Purchase Timeline",
    question: "When is the customer planning or expecting to purchase a property?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "WITHIN_3_MONTHS",
        condition:
          'Return WITHIN_3_MONTHS when the customer clearly indicates they are planning to purchase immediately or within the next 3 months. Examples: - "I want to buy this month." - "Within 2 months." - "Probably in the next few weeks." - "As soon as possible."',
      },
      {
        value: "WITHIN_6_MONTHS",
        condition:
          'Return WITHIN_6_MONTHS when the customer clearly indicates a purchase timeline of more than 3 months but within 6 months. Examples: - "Around 4 months." - "Maybe in 5 or 6 months." - "Within the next half year."',
      },
      {
        value: "WITHIN_1_YEAR",
        condition:
          'Return WITHIN_1_YEAR when the customer clearly indicates a purchase timeline of more than 6 months but within 1 year. Examples: - "Within this year." - "Maybe in 8 or 10 months." - "Before next year." Only use this when the timing clearly falls within one year.',
      },
      {
        value: "AFTER_1_YEAR",
        condition:
          'Return AFTER_1_YEAR when the customer clearly indicates that the purchase is planned more than one year from now. Examples: - "Maybe after 1.5 years." - "Probably in 2 years." - "Not before next year."',
      },
      {
        value: "FLEXIBLE",
        condition:
          'Return FLEXIBLE when the customer clearly indicates that they do not have a fixed timeline and are willing to purchase whenever the right property or opportunity is found. Examples: - "No fixed timeline, if I find something good I can proceed." - "Anytime is fine if the property suits me." - "I\'m flexible on timing." Do not use FLEXIBLE merely because the customer is unsure.',
      },
      {
        value: "NOT_DECIDED",
        condition:
          'When the customer explicitly says they have not decided the purchase timeline yet or are unsure when they will buy. Examples: - "I haven\'t decided yet." - "Not sure when I\'ll buy." - "Still thinking about it." Do not return NOT_DECIDED simply because the customer did not mention a timeline.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-location-mismatch",
    name: "real_estate_location_mismatch",
    displayName: "Looking at Different Location",
    question: "does customer prefer a different location from the project being discussed?",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Only when the customer explicitly states or clearly confirms that they prefer a different location from the project being discussed. Examples include saying i am not looking at this location, and naming another preferred area, or clearly asking for properties in another location. Otherwise return no value.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-next-action",
    name: "real_estate_next_action",
    displayName: "Next Action",
    question: "What is the next action agreed with or requested by the customer at the during of the conversation?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "CONSULTANT_FOLLOWUP",
        condition:
          'Return CONSULTANT_FOLLOWUP when the customer explicitly requests or clearly agrees to a follow-up call from a human consultant, sales representative, advisor, relationship manager, or similar person. Examples: - "Ask your sales person to call me." - Agent asks whether a consultant can call, and the customer clearly agrees. - "I want to speak with someone from your sales team." Do not return this merely because the agent says someone will call without customer agreement.',
      },
      {
        value: "SITE_VISIT",
        condition:
          'Return SITE_VISIT when the customer explicitly requests, agrees to, or clearly confirms a visit to the property, project, sales office, model unit, or site. Examples: - "I can visit this weekend." - "Can I come and see the property?" - Customer agrees when the agent proposes a site visit. Do not return SITE_VISIT merely because the agent discusses or offers a visit.',
      },
      {
        value: "CALL_BACK_LATER",
        condition:
          'Return CALL_BACK_LATER when the customer asks to continue the conversation through another phone call at a later time. Examples: - "Call me later." - "I\'m busy now, call tomorrow." - "Can you call me in the evening?" This refers to a general callback and does not necessarily mean a human consultant follow-up. If the customer specifically agrees to a consultant or sales-person callback, use CONSULTANT_FOLLOWUP instead.',
      },
      {
        value: "SHARE_DETAILS",
        condition:
          'Return SHARE_DETAILS when the customer asks for or clearly agrees to receive information such as project details, brochure, pricing, floor plans, availability, location information, or similar material. Examples: - "Send me the details." - "Please WhatsApp the brochure." - "Email me the price details." Do not return this merely because the agent says they will send information unless the customer requests or clearly accepts it.',
      },
      {
        value: "NONE",
        condition:
          "Return NONE when there is enough conversation to determine that no follow-up action was requested or agreed. Examples: - Customer clearly says they are not interested and ends the call. - Customer discusses the project but declines further action. - Customer gives a clear response but no callback, consultant follow-up, site visit, or information sharing is requested or agreed. Do not use NONE when the call is too short, unclear, disconnected, or otherwise insufficient to determine whether there was a next action. In those cases, return no value rather than forcing NONE.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-property-purchase",
    name: "real_estate_property_purchase",
    displayName: "Looking for Property",
    question: "Did the customer clearly confirm that they are currently looking to buy a property?",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'Return YES only when the customer clearly confirms that they are currently looking for, considering, or planning to purchase a property. Examples: - "Yes, I\'m looking for a property." - "Yes, we\'re planning to buy." - "I\'m searching for a flat." - "I\'m looking for a villa." - "We are considering buying a property." - "Yes, I\'m checking a few projects." - Agent asks, "Are you looking to buy a property?" and the customer clearly says "Yes." Do not return YES when the customer only discusses real estate generally without confirming personal purchase intent. If the condition is not clearly met, return no value.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-preferred-property-type",
    name: "real_estate_preferred_property_type",
    displayName: "Property Type",
    question: "What property type or property types did the customer clearly state or confirm they are interested in?",
    questionType: "MULTI_CHOICE",
    objectiveOptions: [
      {
        value: "APARTMENT",
        condition:
          'Only when the customer clearly states or confirms that they are interested in an apartment, flat, or equivalent apartment-type residential unit. Examples: - "I\'m looking for an apartment." - "looking for a flat." - "Apartment"',
      },
      {
        value: "VILLA",
        condition:
          'Only when the customer clearly states or confirms that they are interested in a villa. Examples: - "I\'m looking for a villa." - "I prefer villas." - "villa"',
      },
      {
        value: "PLOT",
        condition:
          'Only when the customer clearly states or confirms that they are interested in purchasing a plot or land for residential/property purposes. Examples: - "I\'m looking for a plot." - "I want residential land." - "plots"',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-customer-interest",
    name: "real_estate_customer_interest",
    displayName: "Interested Customers",
    question: "Based on the customer's responses during the call, is the customer interested in the property, project, or real-estate opportunity being discussed or identified?",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "INTERESTED",
        condition:
          'Return INTERESTED when the customer clearly shows genuine interest in the property or project being discussed. Evidence may include: - explicitly saying they are interested, - asking meaningful questions about price, availability, configuration, location, amenities, possession, payment plan, or similar details, - sharing requirements in the context of evaluating the project, - requesting project details or brochure, - agreeing to a consultant follow-up, - agreeing to or requesting a site visit, - indicating that the property or project may suit their requirement. Examples: - "Yes, this sounds interesting." - "What is the price for the 3 BHK?" - "Please send me the brochure." - "I want to visit the project this weekend." Do not return INTERESTED when there is only general property-buying intent without evidence of interest in the specific project or opportunity being discussed.',
      },
      {
        value: "NOT_INTERESTED",
        condition:
          'Return NOT_INTERESTED when the customer clearly indicates that they are not interested in the property, project, or opportunity being discussed. Examples: - "I\'m not interested." - "This project is not for me." - "I don\'t want this property." - "The location doesn\'t work for me, so I\'m not considering it." - "No, I\'m not interested in this project." Use the customer\'s final position if they initially engage but later clearly reject the opportunity. Do not return NOT_INTERESTED merely because the customer has an objection or mismatch if they still continue evaluating the opportunity.',
      },
      {
        value: "UNCLEAR",
        condition:
          "Return UNCLEAR when there is not enough evidence to reliably classify the customer as interested or not interested. Examples: - customer says they are busy and asks for a callback, - conversation ends before meaningful discussion, - customer gives only short or neutral responses, - customer confirms they are generally looking for property but does not meaningfully engage with the specific project, - language or call-quality issues prevent interest from being established, - customer asks only a basic factual question without showing a clear positive or negative position. Use UNCLEAR only when the customer's interest genuinely cannot be determined from the conversation.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-consultant-followup",
    name: "real_estate_consultant_followup",
    displayName: "Consultant Follow-up",
    question: "Did the customer explicitly agree to or request a callback from a human consultant, advisor, senior representative, sales expert, or other team member?",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "Yes",
        condition:
          "Return YES only when clearly request or agree to receive a follow-up call from a human consultant or sales representative?",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },
];