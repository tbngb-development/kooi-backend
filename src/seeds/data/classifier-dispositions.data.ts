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
    slug: "general-language-support-required",
    name: "general_language_support_required",
    displayName: "Language Issue",
    question:
      "Does the customer require support in a different language because they cannot comfortably continue the conversation in the language used by the agent? Use only the customer's own statements, responses, or clearly observable communication difficulty during the call. Do not infer a language-support requirement merely because the customer has an accent, uses a few words from another language, or switches briefly between languages. If the customer can understand and continue the conversation in the current language, this should not match.",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "The customer clearly needs another language in order to continue the conversation. Examples: the customer asks the agent to speak in another language, the customer says they do not understand or are not comfortable with the current language, the customer repeatedly responds in another language and meaningful conversation cannot continue, the customer asks for someone who can speak their preferred language, or the call cannot progress because of the language barrier. Do not match when the customer merely uses another language occasionally but still understands and communicates successfully.",
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-callback-required",
    name: "general_callback_required",
    displayName: "Callback Later",
    question:
      "Did the customer clearly ask to call back later? The callback request may happen at any point during the conversation; it does not have to be the final outcome. Do not match merely because the agent offered to call later, the agent said my team will callback, the customer asked only for WhatsApp or email details, the customer agreed to a consultant or human follow-up instead, or the customer was simply busy without asking for another call. If the customer initially asks for a callback but later cancels or declines it, do not match.",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'The customer explicitly requests or clearly agrees to another phone call at a later time. Examples: "Call me later." "Call me tomorrow." "Call me after 10 minutes." "I\'m busy now, call me in the evening." "Can you call me back?" "Call after 5 PM." "Speak to me next week." Or Agent: "Shall I call you later?" Customer: "Yes." Do not match when the customer only agrees to a human consultant or sales representative follow-up — that should be captured separately under the consultant follow-up disposition.',
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-channel-to-share-details",
    name: "general_channel_to_share_details",
    displayName: "Share Details",
    question:
      "Which communication channel did the customer clearly request or agree to use for receiving the details? Use only the customer's own request or explicit confirmation. Do not select a channel merely because the agent suggested, mentioned, or normally uses that channel. Do not infer the channel from the customer's phone number, presence of an email address, previous communication, campaign settings, or agent workflow.",
    questionType: "MULTI_CHOICE",
    objectiveOptions: [
      {
        value: "WHATSAPP",
        condition:
          'The customer explicitly requests or clearly agrees to receive the details through WhatsApp. Examples: "Send it on WhatsApp." "You can WhatsApp me the brochure." Or Agent: "Can I send the details on WhatsApp?" Customer: "Yes." Do not match merely because the agent says they will send the details on WhatsApp without customer confirmation.',
      },
      {
        value: "EMAIL",
        condition:
          'The customer explicitly requests or clearly agrees to receive the details through email. Examples: "Please email me the details." "Send the brochure to my email." Or Agent asks whether the details can be emailed and the customer clearly agrees. Do not match merely because an email address is available or the agent mentions email.',
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-do-not-call",
    name: "general_do_not_call",
    displayName: "Do Not Call",
    question:
      "Did the customer clearly ask not to be contacted or called again? This disposition is intended to capture clear requests to stop future contact. Do not match merely because the customer says they are not interested, is busy, asks to be called later, ends the current call, rejects the current offer, says they already purchased elsewhere, or does not want to continue the current conversation. A rejection of the current opportunity is not automatically a Do Not Call request.",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'The customer clearly requests that future calls or contact should stop. Examples: "Do not call me again." "Please remove my number from your list." "Stop calling me." "I don\'t want any more calls." "Don\'t contact me again." "Please delete my number." "No more calls from your company." Do not match for statements such as "I\'m not interested." "Not now." "I\'m busy." "Call me later." or "I already bought a property."',
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  {
    slug: "general-customer-language",
    name: "general_customer_language",
    displayName: "Customer Language",
    question:
      "What language is the customer primarily speaking during the call? Identify the language from the customer's own speech only. Do not use the agent's language, campaign language, customer name, location, accent, or any other contextual information as evidence. If the customer uses more than one language, select the language they predominantly use during the meaningful part of the conversation.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "ENGLISH",
        condition:
          "The customer predominantly communicates in English during the conversation. Do not select English merely because the customer uses a few English words or phrases.",
      },
      {
        value: "MALAYALAM",
        condition:
          "The customer predominantly communicates in Malayalam.",
      },
      {
        value: "HINDI",
        condition: "The customer predominantly communicates in Hindi.",
      },
      {
        value: "KANNADA",
        condition: "The customer predominantly communicates in Kannada.",
      },
      {
        value: "TAMIL",
        condition: "The customer predominantly communicates in Tamil.",
      },
      {
        value: "TELUGU",
        condition: "The customer predominantly communicates in Telugu.",
      },
      {
        value: "NON_ENGLISH_UNIDENTIFIED",
        condition:
          "There is clear evidence that the customer is speaking a non-English language, but the specific language cannot be identified reliably. Use this only when there are multiple meaningful customer utterances indicating a non-English language. Do not use this when there is too little speech to determine whether the language is English or non-English.",
      },
      {
        value: "NOT_DETERMINED",
        condition:
          "There is insufficient usable customer speech to reliably identify the language. Examples: only a very short response, mostly silence, call disconnects almost immediately, or speech is too unclear or incomplete to identify the language. Do not use this when it is clear that the customer is speaking a non-English language but the exact language is unknown — use NON_ENGLISH_UNIDENTIFIED instead.",
      },
    ],
    industryPackSlug: null,
    isActive: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REAL ESTATE CLASSIFIERS (industryPackSlug = "real-estate")
  // ─────────────────────────────────────────────────────────────────────────

  {
    slug: "real-estate-consultant-followup",
    name: "real_estate_consultant_followup",
    displayName: "Consultant Follow-up",
    question:
      "Did the customer explicitly agree to or request a callback from a human consultant, advisor, senior representative, sales expert, or other team member? This should match only when there is clear evidence that the customer wants or accepts a human follow-up call. Do not match when the customer only asks to receive details, asks for WhatsApp or email information, asks the current agent to call again later, requests a brochure/pricing/floor plan, shows interest in the project, asks general questions, agrees to a site visit, or simply says okay to a vague statement about future contact.",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'The customer clearly agrees to or requests a human consultant follow-up. Examples: Agent: "Can I arrange a callback from our senior consultant?" Customer: "Yes." Agent: "Would you like one of our property advisors to call you?" Customer: "Yes, please." Customer: "Can I speak with a consultant?" Customer: "Please ask someone from your sales team to call me." Customer: "I want to speak with an expert before deciding." Customer: "Can a senior person call me?" Do not match for: "Share the details on WhatsApp." "Send me the brochure." "Email me the price." "Call me later." or when the agent says someone may call later and the customer does not explicitly agree.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-customer-interest",
    name: "real_estate_customer_interest",
    displayName: "Interested Customers",
    question:
      "Based on the customer's responses during the call, is the customer interested in the property, project, or real-estate opportunity being discussed? Classify based on the overall conversation using only the customer's own statements, questions, responses, and explicitly confirmed actions. Do not classify based only on the agent's enthusiasm, sales pitch, project features, or suggested next steps. Use the customer's final position when their interest changes during the call.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "INTERESTED",
        condition:
          'The customer clearly shows genuine interest in the property or project being discussed. Evidence may include: explicitly saying they are interested, asking meaningful questions about price/availability/configuration/location/amenities/possession/payment plan, sharing requirements in the context of evaluating the project, requesting project details or brochure, agreeing to a consultant follow-up, agreeing to or requesting a site visit, or indicating that the property may suit their requirement. Examples: "Yes, this sounds interesting." "What is the price for the 3 BHK?" "Please send me the brochure." "I want to visit the project this weekend."',
      },
      {
        value: "NOT_INTERESTED",
        condition:
          'The customer clearly indicates that they are not interested in the property, project, or opportunity being discussed. Examples: "I\'m not interested." "This project is not for me." "I don\'t want this property." "The location doesn\'t work for me, so I\'m not considering it." Use the customer\'s final position if they initially engage but later clearly reject. Do not match merely because the customer has an objection or mismatch if they still continue evaluating.',
      },
      {
        value: "UNCLEAR",
        condition:
          "There is not enough evidence to reliably classify the customer. Examples: customer says they are busy and asks for a callback, conversation ends before meaningful discussion, customer gives only short or neutral responses, customer confirms they are generally looking for property but does not meaningfully engage with the specific project, language or call-quality issues prevent interest from being established, or customer asks only a basic factual question without showing a clear positive or negative position.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-preferred-property-type",
    name: "real_estate_preferred_property_type",
    displayName: "Property Type",
    question:
      "What property type or property types did the customer clearly state or confirm they are interested in? Use only the customer's own statements or explicit confirmations. Do not treat property types mentioned only by the agent, project description, campaign context, or inventory as the customer's preference. Do not infer property type from configuration, budget, location, purchase purpose, or any other information. If the customer mentions multiple supported property types, match all applicable values.",
    questionType: "MULTI_CHOICE",
    objectiveOptions: [
      {
        value: "APARTMENT",
        condition:
          'The customer clearly states or confirms interest in an apartment, flat, or equivalent apartment-type residential unit. Examples: "I\'m looking for an apartment." "Looking for a flat." "Apartment"',
      },
      {
        value: "VILLA",
        condition:
          'The customer clearly states or confirms interest in a villa. Examples: "I\'m looking for a villa." "I prefer villas." "Villa"',
      },
      {
        value: "PLOT",
        condition:
          'The customer clearly states or confirms interest in purchasing a plot or land for residential/property purposes. Examples: "I\'m looking for a plot." "I want residential land." "Plots"',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-property-purchase",
    name: "real_estate_property_purchase",
    displayName: "Looking for Property",
    question:
      "Did the customer clearly confirm that they are currently looking to buy a property? The positive confirmation may happen at any point during the conversation; it does not need to be an exact answer to the initial question. Do not match merely because the customer discusses property prices or locations, asks a general real-estate question, listens to the project introduction, is a broker, already completed a property purchase, or because the agent assumes they are a property buyer. Do not infer purchase intent from budget, configuration, or location preference.",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'The customer clearly confirms they are currently looking for, considering, or planning to purchase a property. Examples: "Yes, I\'m looking for a property." "Yes, we\'re planning to buy." "I\'m searching for a flat." "I\'m looking for a villa." "We are considering buying a property." "Yes, I\'m checking a few projects." Or Agent asks "Are you looking to buy a property?" and the customer clearly says "Yes." Do not match when the customer only discusses real estate generally without confirming personal purchase intent.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-next-action",
    name: "real_estate_next_action",
    displayName: "Next Action",
    question:
      "What is the next action agreed with or requested by the customer during the conversation? Determine the customer's final agreed next step based only on the customer's own statements or explicit confirmations. Do not treat an action suggested only by the agent as the customer's next action unless the customer clearly agrees. Use the strongest and most specific agreed action when multiple actions are discussed. Recommended priority: SITE_VISIT > CONSULTANT_FOLLOWUP > CALL_BACK_LATER > SHARE_DETAILS > NONE.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "CONSULTANT_FOLLOWUP",
        condition:
          'The customer explicitly requests or clearly agrees to a follow-up call from a human consultant, sales representative, advisor, or relationship manager. Examples: "Ask your sales person to call me." Agent asks whether a consultant can call and the customer clearly agrees. "I want to speak with someone from your sales team." Do not match merely because the agent says someone will call without customer agreement.',
      },
      {
        value: "SITE_VISIT",
        condition:
          'The customer explicitly requests, agrees to, or clearly confirms a visit to the property, project, sales office, model unit, or site. Examples: "I can visit this weekend." "Can I come and see the property?" Or customer agrees when the agent proposes a site visit. Do not match merely because the agent discusses or offers a visit.',
      },
      {
        value: "CALL_BACK_LATER",
        condition:
          'The customer asks to continue the conversation through another phone call at a later time. Examples: "Call me later." "I\'m busy now, call tomorrow." "Can you call me in the evening?" This refers to a general callback. If the customer specifically agrees to a consultant callback, use CONSULTANT_FOLLOWUP instead.',
      },
      {
        value: "SHARE_DETAILS",
        condition:
          'The customer asks for or clearly agrees to receive information such as project details, brochure, pricing, floor plans, availability, or location. Examples: "Send me the details." "Please WhatsApp the brochure." "Email me the price details." Do not match merely because the agent says they will send information unless the customer requests or clearly accepts it.',
      },
      {
        value: "NONE",
        condition:
          "There is enough conversation to determine that no follow-up action was requested or agreed. Examples: customer clearly says they are not interested and ends the call, customer discusses the project but declines further action, customer gives a clear response but no callback/consultant follow-up/site visit/information sharing is requested or agreed. Do not use NONE when the call is too short, unclear, or disconnected to determine whether there was a next action.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-location-mismatch",
    name: "real_estate_location_mismatch",
    displayName: "Looking at Different Location",
    question:
      "Does the customer prefer a different location from the project being discussed? Only use the customer's own statements or explicit confirmations. The project location mentioned by the agent is not evidence of the customer's preferred location. Do not infer a location mismatch merely because another location appears in the conversation. Do not match merely because the customer asks about connectivity, nearby areas, or landmarks, compares the project location with another area, or does not mention any location preference.",
    questionType: "BOOLEAN",
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'The customer explicitly states or clearly confirms that they prefer a different location from the project being discussed. Examples include saying "I am not looking at this location" and naming another preferred area, or clearly asking for properties in another location.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-purchase-timeline",
    name: "real_estate_purchase_timeline",
    displayName: "Purchase Timeline",
    question:
      "When is the customer planning or expecting to purchase a property? Use only the customer's own stated or explicitly confirmed purchase timeline. Do not infer the timeline from project possession date, payment plan, loan approval, agent suggestions, or urgency created by the agent. If the customer changes their timeline during the conversation, use the final confirmed one. No timeline mentioned should not match. Customer explicitly says they haven't decided → NOT_DECIDED. Customer says timing is open/flexible → FLEXIBLE.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "WITHIN_3_MONTHS",
        condition:
          'The customer clearly indicates purchasing immediately or within the next 3 months. Examples: "I want to buy this month." "Within 2 months." "Probably in the next few weeks." "As soon as possible."',
      },
      {
        value: "WITHIN_6_MONTHS",
        condition:
          'The customer clearly indicates a purchase timeline of more than 3 months but within 6 months. Examples: "Around 4 months." "Maybe in 5 or 6 months." "Within the next half year."',
      },
      {
        value: "WITHIN_1_YEAR",
        condition:
          'The customer clearly indicates a purchase timeline of more than 6 months but within 1 year. Examples: "Within this year." "Maybe in 8 or 10 months." "Before next year."',
      },
      {
        value: "AFTER_1_YEAR",
        condition:
          'The customer clearly indicates the purchase is planned more than one year from now. Examples: "Maybe after 1.5 years." "Probably in 2 years." "Not before next year."',
      },
      {
        value: "FLEXIBLE",
        condition:
          'The customer clearly indicates they do not have a fixed timeline and will purchase whenever the right property is found. Examples: "No fixed timeline, if I find something good I can proceed." "Anytime is fine if the property suits me." "I\'m flexible on timing." Do not use merely because the customer is unsure.',
      },
      {
        value: "NOT_DECIDED",
        condition:
          'The customer explicitly says they have not decided the purchase timeline yet or are unsure when they will buy. Examples: "I haven\'t decided yet." "Not sure when I\'ll buy." "Still thinking about it." Do not match simply because the customer did not mention a timeline.',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-preferred-configuration",
    name: "real_estate_preferred_configuration",
    displayName: "Preferred Configuration",
    question:
      "What property configuration is the customer looking for? Use only the customer's own statements or explicit confirmations. Do not treat configurations mentioned only by the agent, project description, campaign context, or inventory as the customer's preference. Do not infer configuration from the customer's budget, family size, property type, or purchase purpose. If the customer mentions multiple acceptable configurations, match all clearly confirmed options.",
    questionType: "MULTI_CHOICE",
    objectiveOptions: [
      {
        value: "STUDIO",
        condition:
          "The customer clearly states or confirms that they are looking for a studio, studio apartment, 1 RK, or an equivalent studio-type configuration.",
      },
      {
        value: "1_BHK",
        condition:
          "The customer clearly states or confirms that they are looking for a 1 BHK, one-bedroom, or equivalent configuration.",
      },
      {
        value: "2_BHK",
        condition:
          "The customer clearly states or confirms that they are looking for a 2 BHK, two-bedroom, or equivalent configuration.",
      },
      {
        value: "3_BHK",
        condition:
          "The customer clearly states or confirms that they are looking for a 3 BHK, three-bedroom, or equivalent configuration.",
      },
      {
        value: "4_BHK",
        condition:
          "The customer clearly states or confirms that they are looking for a 4 BHK, four-bedroom, or equivalent configuration.",
      },
      {
        value: "5_BHK",
        condition:
          "The customer clearly states or confirms that they are looking for a 5 BHK, five-bedroom, or equivalent configuration.",
      },
      {
        value: "6_BHK",
        condition:
          "The customer clearly states or confirms that they are looking for a 6 BHK, six-bedroom, or equivalent configuration.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-purchase-purpose",
    name: "real_estate_purchase_purpose",
    displayName: "Purchase Purpose",
    question:
      "Did the customer state or confirm whether they are buying the property for personal use, investment, or both? Do not infer the purpose from configuration, budget, location, property type, or family size. Do not select a value merely because the agent suggested it — the customer must accept or confirm it. If the customer changes or corrects the purpose during the call, use the final confirmed purpose.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "OWN_USE",
        condition:
          "The customer says they are buying for themselves, their family, or to live in the property.",
      },
      {
        value: "INVESTMENT",
        condition:
          "The customer says they are buying for investment, rental income, resale, or appreciation.",
      },
      {
        value: "BOTH",
        condition:
          "The customer explicitly states they are buying for both personal use and investment.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-budget-range",
    name: "real_estate_budget_range",
    displayName: "Budget Range",
    question:
      "What budget range did the customer personally state or indicate for the property purchase? Use only the customer's own stated or explicitly confirmed budget. Do not treat project pricing, unit pricing, offers, payment plans, EMI amounts, loan eligibility, or budget figures mentioned only by the agent as the customer's budget. Do not infer the customer's budget from their preferred configuration, property type, profession, income, location, or purchase purpose.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "BELOW_1_CR",
        condition:
          'The customer clearly states or confirms a budget below ₹1 crore. Examples: "Around 70 lakhs." "My budget is 90 lakhs." "Below one crore."',
      },
      {
        value: "1_TO_2_CR",
        condition:
          'The customer\'s clearly stated budget falls from ₹1 crore up to ₹2 crore. Examples: "Around 1.2 crore." "My budget is 1.5 crore." "Between 1 and 2 crore."',
      },
      {
        value: "2_TO_3_CR",
        condition:
          'The customer\'s clearly stated budget falls above ₹2 crore and up to ₹3 crore. Examples: "Around 2.5 crore." "My budget is 2.8 crore." "Between 2 and 3 crore."',
      },
      {
        value: "ABOVE_3_CR",
        condition:
          'The customer clearly states or confirms a budget above ₹3 crore. Examples: "Around 4 crore." "Anything above 3 crore is fine." "My budget can go up to 5 crore."',
      },
      {
        value: "FLEXIBLE",
        condition:
          "The customer explicitly says their budget is flexible, negotiable, or not strictly limited to a specific range.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-lead-temperature",
    name: "real_estate_lead_temperature",
    displayName: "Lead Temperature",
    question:
      "What is the customer's lead temperature based on their overall buying intent, engagement, purchase readiness, and next-step commitment? Review the entire conversation and classify based on the customer's overall real-estate buying intent and readiness. Use only the customer's own statements, responses, requirements, questions, objections, timeline, and agreed actions. Use the customer's final state when their interest changes during the conversation.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "HOT",
        condition:
          'The customer shows strong buying intent and is ready for an immediate or near-term action. Indicators: agrees to or requests a site visit, wants to speak with a consultant soon, has a near-term purchase timeline, discusses specific requirements and wants to proceed, asks about booking, availability, negotiation, payment, or immediate next steps. Examples: "I want to visit this weekend." "Ask your consultant to call me today." "I\'m planning to buy within two months."',
      },
      {
        value: "WARM",
        condition:
          'The customer shows genuine interest and is actively evaluating the opportunity but is not yet ready for an immediate decision. Indicators: shares meaningful requirements, asks relevant project questions, requests details, agrees to follow-up, compares the project with other options, has a realistic medium-term purchase intention. Examples: "Send me the brochure, I\'m comparing a few projects." "I\'m looking for a 3 BHK around this budget." "I may buy within six months."',
      },
      {
        value: "NURTURE",
        condition:
          'The customer has genuine future buying potential but is not ready to act in the near term. Indicators: purchase planned after a long period, early-stage research, waiting for finances/family decision/job change/market conditions, interested but not currently ready to proceed. Examples: "Maybe next year." "I\'m just exploring for now." "I\'m interested, but I won\'t buy anytime soon." Use NURTURE instead of COLD when future purchase intent still exists.',
      },
      {
        value: "COLD",
        condition:
          'The customer is a genuine prospect but clearly has little or no interest in the current opportunity. Indicators: clearly says they are not interested, rejects the project, says the opportunity is unsuitable and does not want to continue, does not want further information or follow-up. Examples: "I\'m not interested." "This project is not for me." "The location doesn\'t work for me, so I\'m not considering it."',
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },

  {
    slug: "real-estate-final-outcome",
    name: "real_estate_final_outcome",
    displayName: "Final Outcome",
    question:
      "What single outcome best represents how the call ultimately ended? Review the entire conversation and return exactly one final outcome that best represents the customer's final state or the actual reason the call ended. Use the customer's own statements, explicit confirmations, and the actual call interaction. Do not classify based only on actions proposed by the agent. When several events occur, use the most meaningful final or committed outcome, not every action that happened. Priority: DO_NOT_CALL > SITE_VISIT > CONSULTANT_FOLLOWUP > CALLBACK_REQUESTED > SHARE_DETAILS > INTERESTED_NO_ACTION.",
    questionType: "CHOICE",
    objectiveOptions: [
      {
        value: "SITE_VISIT",
        condition:
          'The customer clearly requests, agrees to, or confirms a visit to the property, project, sales office, model unit, or site. Examples: "I\'ll visit this Saturday." "Can I come and see the project?" Or customer accepts a proposed site visit. If details or a consultant conversation are also part of arranging the visit, use SITE_VISIT when the site visit is the primary committed next step.',
      },
      {
        value: "CONSULTANT_FOLLOWUP",
        condition:
          'The customer clearly requests or agrees to a follow-up call from a human consultant, sales representative, relationship manager, or advisor. Examples: "Ask your sales person to call me." "I\'d like to speak with a consultant." Or customer accepts the agent\'s offer. If details are also being shared but the customer has agreed to a consultant conversation, use CONSULTANT_FOLLOWUP.',
      },
      {
        value: "CALLBACK_REQUESTED",
        condition:
          'The customer\'s primary outcome is a request to be called again later. Examples: "I\'m busy. Call me this evening." "Call me tomorrow." "Can you call back later?" Use for a general callback. If the customer specifically agrees to a consultant call, use CONSULTANT_FOLLOWUP instead.',
      },
      {
        value: "SHARE_DETAILS",
        condition:
          'The primary agreed next action is to send the customer information such as brochure, pricing, floor plans, or project details. Examples: "Send me the brochure on WhatsApp." "Please email the price details." Do not match merely because the agent says they will send information without customer agreement. If a stronger action is subsequently agreed, use that stronger final outcome instead.',
      },
      {
        value: "INTERESTED_NO_ACTION",
        condition:
          "The customer clearly demonstrates genuine interest in the project but no specific next action is requested or agreed. Examples: customer meaningfully discusses their requirements and expresses interest but says they will think about it, customer says the project sounds interesting but does not request details/callback/consultant follow-up/site visit. Do not use simply because the customer is generally looking for property — there must be clear interest in the opportunity being discussed.",
      },
      {
        value: "NOT_INTERESTED",
        condition:
          'The customer clearly states or demonstrates they are not interested in the project. Examples: "I\'m not interested." "This project isn\'t suitable for me." "No thanks, I\'m not considering this." Do not use merely because the customer is busy, has an objection, prefers another location, or has a long timeline while remaining interested. If the customer also asks not to receive future contact, use DO_NOT_CALL instead.',
      },
      {
        value: "DO_NOT_CALL",
        condition:
          'The customer explicitly asks not to be called or contacted again, or asks to be removed from the contact list. Examples: "Don\'t call me again." "Remove my number." "Stop contacting me." This takes precedence over NOT_INTERESTED.',
      },
      {
        value: "ALREADY_PURCHASED",
        condition:
          'The customer clearly states they have already purchased or finalized another property and are no longer looking because of that purchase. Examples: "I\'ve already bought a flat." "We finalized another property last month." Do not use merely because the customer owns another property — the statement should indicate the existing purchase makes the current opportunity no longer relevant.',
      },
      {
        value: "BROKER_OR_CHANNEL_PARTNER",
        condition:
          "The person identifies themselves as a broker, property agent, channel partner, intermediary, or similar industry professional rather than the intended end-customer prospect. Do not infer this from the person's questions or real-estate knowledge alone.",
      },
      {
        value: "LANGUAGE_ISSUE",
        condition:
          "The conversation cannot meaningfully continue or be qualified because the customer requires a language that the agent cannot support. Examples: customer asks for another language and the agent cannot continue in it, meaningful communication repeatedly fails because of the language barrier. Do not use merely because the customer speaks another language if the conversation successfully continues.",
      },
      {
        value: "WRONG_NUMBER",
        condition:
          'There is clear evidence that the call reached the wrong person or an incorrect phone number. Examples: "You have the wrong number." "There is nobody by that name here." Or recipient clearly confirms they are unrelated to the intended customer. Do not use simply because the recipient is not interested.',
      },
      {
        value: "NO_RESPONSE",
        condition:
          "The call connects but there is no meaningful customer response. Examples: silence throughout the interaction, repeated agent attempts receive no usable response, no meaningful customer speech is captured. Do not use if the customer actually begins a meaningful conversation before disconnection.",
      },
      {
        value: "CALL_DROPPED",
        condition:
          'A meaningful conversation has started but the call unexpectedly disconnects before a clear final outcome is reached. Do not use just because the customer intentionally ends the call after clearly communicating an outcome. Example: Customer: "I\'m not interested." disconnects → NOT_INTERESTED, not CALL_DROPPED. Customer is discussing requirements and the connection suddenly ends before any outcome is established → CALL_DROPPED.',
      },
      {
        value: "INSUFFICIENT_CONVERSATION",
        condition:
          "Some customer interaction occurs, but there is not enough meaningful conversation to determine another valid final outcome. Examples: customer gives one or two ambiguous responses and ends the call, extremely short interaction without clear intent, conversation starts but never progresses enough. Distinguish from NO_RESPONSE (no meaningful customer response) and CALL_DROPPED (meaningful conversation interrupted unexpectedly).",
      },
      {
        value: "OTHER",
        condition:
          "The conversation has a clear and meaningful final outcome that does not reasonably match any other configured value. Do not use simply because the outcome is unclear — if there is insufficient information, use INSUFFICIENT_CONVERSATION.",
      },
    ],
    industryPackSlug: "real-estate",
    isActive: true,
  },
];