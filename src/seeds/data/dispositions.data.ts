export interface DispositionObjectiveOption {
  value: string;
  condition: string;
  sortOrder?: number;
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
    slug: "general-language-support-required",
    name: "general_language_support_required",
    displayName: "Language Issue",
    tag: null,
    question:
      "Does the customer require support in a different language because they cannot comfortably continue the conversation in the language used by the agent?",
    systemPrompt:
      "Use only the customer's own statements, responses, or clearly observable communication difficulty during the call.\nReturn a value only when there is clear evidence that the customer cannot comfortably continue because the required language is not supported by the agent.\nDo not infer a language-support requirement merely because the customer:\n- has an accent,\n- uses a few words from another language,\n- switches briefly between languages,\n- speaks another language but still continues the conversation successfully,\n- or because the agent mentions language options.\nIf the customer can understand and continue the conversation in the current language, return no value.\nIf there is no clear evidence of a language barrier, return no value.\nDo not guess.\nIf the condition is not clearly met, return no value.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Return YES only when the customer clearly needs another language in order to continue the conversation. Examples include: - the customer asks the agent to speak in another language, - the customer says they do not understand or are not comfortable with the current language, - the customer repeatedly responds in another language and meaningful conversation cannot continue, - the customer asks for someone who can speak their preferred language, - the call cannot progress because of the language barrier. Do not return YES when the customer merely uses another language occasionally but still understands and communicates successfully.",
      },
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "general-callback-required",
    name: "general_callback_required",
    displayName: "Callback Later",
    tag: null,
    question: "Did the customer clearly ask to call back later?",
    systemPrompt:
      "Use when a cusomer ask to callback later or said i don't have time now, can you call later.\nThe callback request may happen at any point during the conversation; it does not have to be the final outcome.\nDo not return a value merely because:\n- the agent offered to call later,\n- the agent said my team will callback,\n- the customer asked only for WhatsApp or email details,\n- the customer agreed to a consultant or human follow-up instead,\n- the customer was simply busy without asking for another call.\nIf the customer initially asks for a callback but later cancels or declines it, return no value.\nIf there is no clear callback request or agreement, return as null with low confidence.\nDo not guess.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'Only when the customer explicitly requests or clearly agrees to another phone call at a later time. Examples: - "Call me later." - "Call me tomorrow." - "Call me after 10 minutes" - "I\'m busy now, call me in the evening." - "Can you call me back?" - "Call after 5 PM." - "Speak to me next week." - Agent: "Shall I call you later?" Customer: "Yes." If the condition is not clearly met, return no value. Do not return YES when the customer only agrees to a human consultant or sales representative follow-up. That should be captured separately under the consultant follow-up disposition.',
      },
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
  {
    slug: "real-estate-consultant-followup",
    name: "real_estate_consultant_followup",
    displayName: "Consultant Follow-up",
    tag: null,
    question:
      "Did the customer explicitly agree to or request a callback from a human consultant, advisor, senior representative, sales expert, or other team member?",
    systemPrompt:
      'This disposition should return a value only when there is clear evidence that the customer wants or accepts a human follow-up call from another person such as a consultant, advisor, senior consultant, sales representative, expert, relationship manager, or team member.\nDo not treat general follow-up actions as consultant follow-up.\nDo not return a value when the customer only:\n- asks to receive details,\n- asks for WhatsApp or email information,\n- asks the current agent to call again later,\n- requests a brochure, pricing, floor plan, or other information,\n- shows interest in the project,\n- asks general questions,\n- agrees to a site visit,\n- or simply says "okay" to a vague statement about future contact.\nThe human-follow-up intent must be explicit.\nA valid consultant follow-up happens only when either:\n1. The agent specifically asks permission to arrange a call from a human consultant, advisor, senior consultant, expert, sales representative, team member, relationship manager, or similar person, and the customer clearly agrees.\nOR\n2. The customer explicitly asks to speak with or receive a callback from a human consultant, advisor, expert, senior person, sales representative, or team member.\nIf neither condition is clearly met, return no value.\nDo not infer consultant follow-up from SHARE_DETAILS, CALL_BACK_LATER, customer interest, or any other disposition.\nDo not return NO. Do not guess.',
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "Yes",
        condition:
          'Return YES only when one of these is clearly true: - Agent: "Can I arrange a callback from our senior consultant?"   Customer: "Yes." - Agent: "Would you like one of our property advisors to call you?"   Customer: "Yes, please." - Customer: "Can I speak with a consultant?" - Customer: "Please ask someone from your sales team to call me." - Customer: "I want to speak with an expert before deciding." - Customer: "Can a senior person call me?" Do not return YES for: - "Share the details on WhatsApp." - "Send me the brochure." - "Email me the price." - "Call me later." - "I\'m not interested, but send me the details." - "Okay, send the information." - Agent says "Someone may call you later" and customer does not explicitly agree.',
      },
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
      "What date, time, or time window did the customer clearly state or confirm for the human consultant follow-up call?",
    systemPrompt:
      'Use only the customer\'s own stated or explicitly confirmed schedule for a consultant, sales representative, relationship manager, advisor, or other human follow-up call.\nCapture the schedule as concise dynamic text.\nOnly extract a value when a human consultant follow-up has been requested, accepted, or clearly confirmed.\nDo not use the timing of a general callback unless it is specifically associated with the consultant or human follow-up.\nDo not extract a date or time merely because the agent suggested it. The customer must clearly accept or confirm the timing.\nIf multiple timings are discussed, capture the final confirmed schedule.\nPreserve relative timing naturally, such as:\n- Tomorrow\n- Tomorrow evening\n- Saturday morning\n- After 6 PM\n- Next week\n- Between 3 PM and 5 PM\nDo not convert relative expressions into absolute dates unless your system separately performs date normalization.\nIf the customer agrees to a consultant follow-up but does not specify or confirm any date, time, or time window, return no value.\nIf there is no consultant follow-up agreement, return no value.\nDo not guess.\nExamples\n- "Ask the consultant to call me tomorrow." → Tomorrow\n- "Someone from sales can call after 6 PM." → After 6 PM\n- "Saturday morning would be good." → Saturday morning\n- "Ask them to call next week." → Next week\n- Agent: "Can our consultant call you at 4 PM?" Customer: "Yes." → 4 PM\n- Customer agrees to a consultant call but gives no timing → no extraction\nReturn only the concise schedule text when clearly available.',
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
    showInInsights: false,
  },
  {
    slug: "general-callback-schedule",
    name: "general_callback_schedule",
    displayName: "Callback Time",
    tag: null,
    question:
      "What date, time, or time window did the customer clearly state or confirm for the callback?",
    systemPrompt:
      'Use only the customer\'s own stated or explicitly confirmed callback timing.\nCapture the schedule as concise dynamic text.\nOnly extract a value when the customer has requested or agreed to a general callback.\nDo not use consultant or human follow-up timing here. Consultant callback timing should be captured separately in real_estate.consultant_callback_schedule.\nDo not extract a date or time merely because the agent suggested it. The customer must clearly accept or confirm the timing.\nIf multiple callback timings are discussed, capture the final confirmed schedule.\nPreserve relative timing naturally, such as:\n- Tomorrow\n- Tomorrow evening\n- After 5 PM\n- Monday morning\n- Next week\n- Between 4 PM and 6 PM\nDo not convert relative expressions into absolute dates unless your system separately performs date normalization.\nIf the customer asks for a callback but does not provide or confirm any date, time, or time window, return no value.\nIf there is no callback request, return no value.\nDo not guess.\nExamples\n- "Call me tomorrow." → Tomorrow\n- "Call after 6 PM." → After 6 PM\n- "Monday morning is fine." → Monday morning\n- "Call me sometime next week." → Next week\n- Agent: "Can I call you at 4 PM?" Customer: "Yes." → 4 PM\n- Customer says "Call me later" but gives no timing → no extraction\nReturn only the concise callback schedule text when clearly available.',
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
    slug: "real-estate-customer-interest",
    name: "real_estate_customer_interest",
    displayName: "Interested Customers",
    tag: null,
    question:
      "Based on the customer's responses during the call, is the customer interested in the property, project, or real-estate opportunity being discussed or identified?",
    systemPrompt:
      "Classify the customer's interest based on the overall conversation, using only the customer's own statements, questions, responses, and explicitly confirmed actions.\nDo not classify interest based only on the agent's enthusiasm, sales pitch, project features, or suggested next steps.\nUse the customer's final position when their interest changes during the call.\nDo not treat a customer as INTERESTED merely because they:\n- answered the call,\n- confirmed they are generally looking to buy property,\n- listened to the agent,\n- gave basic demographic or requirement information,\n- or agreed to receive a callback without discussing the project meaningfully.\nDo not treat a customer as NOT_INTERESTED merely because they:\n- are busy,\n- ask to be called later,\n- raise an objection,\n- say the price is high,\n- prefer another location,\n- have a longer purchase timeline,\n- or need more information before deciding.\nIf the conversation does not provide enough evidence to confidently determine interest or disinterest, return UNCLEAR.\nReturn exactly one objective value.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
    question:
      "What property type or property types did the customer clearly state or confirm they are interested in?",
    systemPrompt:
      'Use only the customer\'s own statements or explicit confirmations.\nIf the customer\'s preferred property type clearly matches one or more configured objective values, return the corresponding objective value or values.\nThe configured objective values are:\nAPARTMENT\nVILLA\nPLOT\nUse the subjective output only when the customer clearly states a property type that is outside the configured objective list, but don\'t consider unit configuration as property type, example: 2 BHK, 3 BHK are not property type, its unit configuration.\nDo not use subjective text merely to add descriptions or extra characteristics to an objective property type if the underlying property type is still clearly Apartment, Villa, or Plot.\nFor example:\n- "Luxury apartment" → APARTMENT\n- "Gated community villa" → VILLA\n- "Residential plot" → PLOT\nIf the customer mentions multiple supported property types, return all applicable objective values.\nIf the customer mentions both a supported objective type and an unsupported type, preserve the unsupported requirement as subjective text as well, if your extraction architecture supports both outputs.\nDo not treat property types mentioned only by the agent, project description, campaign context, inventory, or examples as the customer\'s preference.\nDo not infer property type from configuration, budget, location, purchase purpose, or any other information.\nIf the customer changes or corrects their preference, use the final confirmed preference.\nIf the customer does not state or confirm any preferred property type, return no value.\nDo not guess.\n\nSubjective fallback rule\nReturn concise subjective text only when the customer clearly states a property type that does not map to APARTMENT, VILLA, or PLOT.\nExamples:\n- "I\'m looking for a row house." → Subjective: Row house\n- "I want an independent house." → Subjective: Independent house\n- "I\'m looking for a townhouse." → Subjective: Townhouse\n- "I need a farmhouse." → Subjective: Farmhouse\nIf the customer says:\n"Apartment or villa"\n\nreturn objective values:\nAPARTMENT, VILLA\n—not subjective text.\nAnd if the customer never mentions a property type, there should be no extraction at all.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      "Did the customer clearly confirm that they are currently looking to buy a property?",
    systemPrompt:
      "Use only the customer's own statements or explicit confirmation.\nThis disposition is intended to identify customers who positively confirm that they are currently looking for, considering, or planning to purchase a property.\nThe positive confirmation may happen at any point during the conversation; it does not need to be an exact answer to the initial question.\nDo not return a value merely because the customer:\n- discusses property prices or locations,\n- asks a general real-estate question,\n- listens to the project introduction,\n- is a broker or channel partner,\n- already completed a property purchase and is no longer looking,\n- or because the agent assumes they are a property buyer.\nDo not infer purchase intent from budget, configuration, location preference, income, family situation, or any other contextual information.\nIf the customer initially appears interested but later clearly states that they are not actually looking to purchase a property, return no value.\nIf there is no clear positive confirmation that the customer is looking to buy a property, return no value.\nDo not return NO. Do not guess.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "boolean",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'Return YES only when the customer clearly confirms that they are currently looking for, considering, or planning to purchase a property. Examples: - "Yes, I\'m looking for a property." - "Yes, we\'re planning to buy." - "I\'m searching for a flat." - "I\'m looking for a villa." - "We are considering buying a property." - "Yes, I\'m checking a few projects." - Agent asks, "Are you looking to buy a property?" and the customer clearly says "Yes." Do not return YES when the customer only discusses real estate generally without confirming personal purchase intent. If the condition is not clearly met, return no value.',
      },
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
      '"Write a concise 2 to 4 sentence factual summary of the conversation from the customer\'s perspective.\n\nInclude, when available:\n\nthe customer\'s overall interest or intent,\nkey requirements or preferences mentioned,\npreferred location, property type, configuration, budget, or purchase timeline if relevant,\nimportant questions asked by the customer,\nobjections, concerns, or mismatches,\nany meaningful reason for lack of interest,\nthe final next action agreed,\nany callback, consultant follow-up, site visit, or information-sharing commitment,\nany specific follow-up timing mentioned.\n\nPrioritize information that would help a sales or operations team understand what happened in the call and what should happen next.\n\nOnly include information explicitly stated, clearly confirmed, or directly supported by the conversation. Do not infer, assume, exaggerate, or add information that was not discussed.\n\nDo not repeat every detail from the conversation. Focus only on meaningful customer requirements, decisions, objections, and outcomes.\n\nIf information is corrected or clarified during the call, include only the final confirmed value. Do not include earlier incorrect or misheard values unless the clarification itself is important to understanding the call.\n\nIf the customer uses multiple acceptable options, preserve that meaning. For example, if the customer is considering both 2 BHK and 3 BHK, do not reduce it to only one configuration.\n\nIf the conversation ends before meaningful qualification, briefly state what happened, such as:\n\ncustomer requested a callback,\ncustomer was not interested,\nwrong number,\nlanguage barrier,\ncall dropped,\ninsufficient conversation,\nno meaningful response.\n\nDo not describe agent behaviour unless it materially affected the outcome of the call.\n\nDo not include internal disposition codes such as HOT, WARM, CALLBACK_REQUESTED, or SHARE_DETAILS. Express the outcome naturally in plain language.\n\nReturn only the summary. Do not add headings, labels, bullet points, or explanations.\n\nOne small change from your old prompt: I would remove ""Mention if clarification was needed during the call"" as a general rule. That can make summaries noisy. I would only mention clarification when it materially mattered, such as a customer initially giving an unclear configuration or location and later confirming it. Otherwise, storing the final confirmed value is enough.\n\nFor example, a strong output would look like:\n\nThe customer is interested in a 3 BHK apartment around Whitefield with a budget of approximately ₹1.5 crore and is considering a purchase within six months. They asked about pricing and availability and requested the project details on WhatsApp. The customer also agreed to a consultant follow-up tomorrow evening.\n\nWhereas for a short unsuccessful call:\n\nThe customer said they were busy and requested a callback tomorrow afternoon. No property requirements or purchase preferences were discussed.\n\nThis version should work better as the human-readable master summary, while your other dispositions remain the structured data source for dashboards and analytics."',
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
      "Determine the customer's final agreed next step based only on the customer's own statements or explicit confirmations.\nDo not treat an action suggested only by the agent as the customer's next action unless the customer clearly agrees to it.\nReturn exactly one objective value.\nUse the strongest and most specific agreed next action when multiple actions are discussed.\nIf the customer changes their mind during the call, use the final confirmed next action.\nDo not infer a next action from interest level alone.\n\nPriority when multiple actions occur\nWhen multiple actions are agreed, return the action that best represents the primary final next step.\nRecommended priority:\nSITE_VISIT → CONSULTANT_FOLLOWUP → CALL_BACK_LATER → SHARE_DETAILS → NONE\nFor example, if the customer asks for the brochure and then agrees to visit the site, return SITE_VISIT.\nIf they ask for details and also agree to a consultant call, return CONSULTANT_FOLLOWUP.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      "Which communication channel did the customer clearly request or agree to use for receiving the details?",
    systemPrompt:
      "Use only the customer's own request or explicit confirmation.\nDo not select a channel merely because the agent suggested, mentioned, or normally uses that channel.\nReturn one or more objective values only when the customer clearly requests or agrees to receive the information through that channel.\nIf the customer requests both channels, return both applicable values.\nIf the customer asks to receive details but does not specify or confirm WhatsApp or email, return no value.\nDo not infer the channel from:\n- the customer's phone number,\n- presence of an email address,\n- previous communication,\n- campaign settings,\n- agent workflow,\n- or any other contextual information.\nDo not guess.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
      "What location, area, neighbourhood, city, region, or proximity preference did the customer clearly state or confirm for the property?",
    systemPrompt:
      'Use only the customer\'s own stated or explicitly confirmed location preference.\nCapture the customer\'s preference as concise dynamic text for insights.\nDo not treat the project location, nearby landmarks, connectivity points, or other locations mentioned only by the agent as the customer\'s preference.\nDo not infer a preferred location from:\n- the customer\'s current residence,\n- workplace,\n- native place,\n- phone number,\n- project location,\n- travel route,\n- budget,\n- property type,\n- or any other contextual information.\nCapture any meaningful location-related preference, including:\n- specific locality or neighbourhood,\n- road or corridor,\n- city or region,\n- preferred side of a city,\n- multiple acceptable locations,\n- proximity to a landmark, workplace, school, airport, metro, or other place,\n- preferred distance or travel-time requirement.\nIf the customer mentions multiple acceptable locations, preserve all of them.\nIf the customer changes or corrects their location preference during the conversation, capture the final confirmed preference.\nIf the customer does not state or confirm any location preference, return no value.\nDo not return NOT_SHARED, UNKNOWN, or any inferred location.\nDo not guess.\nExamples\n- "I\'m looking around Whitefield." → Whitefield\n- "Sarjapur Road or HSR would work." → Sarjapur Road or HSR\n- "I want something close to Electronic City." → Close to Electronic City\n- "Within 5 km of the airport." → Within 5 km of the airport\n- "South Bangalore is preferred." → South Bangalore\n- "Anywhere between Kengeri and Mysore Road is fine." → Kengeri to Mysore Road area\n- Customer only says "I\'m not interested." → no extraction\n- Agent says "The project is in Devanahalli" and customer says "Okay." → no extraction\nReturn only the concise location preference text when one is clearly provided.',
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
      "does customer prefer a different location from the project being discussed?",
    systemPrompt:
      "Only use the customer's own statements or explicit confirmations.\nThe project location mentioned by the agent is not evidence of the customer's preferred location.\nDo not infer a location mismatch merely because another location appears in the conversation.\nIf there is no clear evidence of a different preferred location, return as null with low confidence.\n\nReturn YES when the customer:\n\nexplicitly says they prefer another location,\nsays the current project location is not suitable and mentions or implies another location,\nindicates that they are only interested in another location.\n\nDo not return YES merely because the customer:\n\nasks about connectivity, nearby areas, or landmarks,\ncompares the project location with another area,\ndoes not mention or discussed any location preference.\n\nIf there is no clear evidence that the customer prefers a different location, leave the value null.\nReturn only YES when applicable. Do not return an explanation.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          "Only when the customer explicitly states or clearly confirms that they prefer a different location from the project being discussed. Examples include saying i am not looking at this location, and naming another preferred area, or clearly asking for properties in another location. Otherwise return no value.",
      },
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
    question:
      "When is the customer planning or expecting to purchase a property?",
    systemPrompt:
      "Use only the customer's own stated or explicitly confirmed purchase timeline.\nDo not infer the timeline from:\n- project possession date,\n- payment plan,\n- loan approval,\n- agent suggestions,\n- campaign context,\n- urgency created by the agent,\n- or any other information not confirmed by the customer.\nMap the customer's stated timeline to the closest applicable objective value only when the meaning is clear.\nIf the customer changes or corrects their timeline during the conversation, use the final confirmed timeline.\nIf the customer gives an unclear or conflicting timeframe that cannot be reliably mapped, return no value rather than guessing.\nIf no purchase timeline is stated or confirmed at all, return no value.\nThis distinction is important:\n- No timeline mentioned → no extraction\n- Customer explicitly says they haven't decided → NOT_DECIDED\n- Customer says timing is open/flexible → FLEXIBLE",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
      'Use only the customer\'s own statements or explicit confirmations.\nDo not treat configurations mentioned only by the agent, project description, campaign context, inventory, examples, or available units as the customer\'s preference.\nDo not infer a configuration from the customer\'s budget, family size, property type, purchase purpose, or any other information.\nIf the customer clearly states or confirms a preferred configuration that matches one or more configured objective values, return the corresponding objective key or keys.\nIf the customer\'s requirement does not fit the configured objective values, or includes meaningful additional detail that should be preserved, return the customer\'s requirement as concise subjective text.\nIf the customer mentions multiple acceptable configurations, preserve all clearly confirmed options.\nIf the customer changes or corrects their preference during the conversation, use the final confirmed requirement.\nIf the customer does not state or confirm any preferred configuration, return no value. Do not return NOT_SHARED, UNKNOWN, or the closest available option.\nDo not guess.\n\nSubjective fallback behavior\nUse subjective text when the customer\'s requirement is outside the configured objective values or contains important extra detail.\nExamples:\n- "I\'m looking for a 2 or 3 BHK." → Subjective: 2_BHK, 3_BHK\n- "I need a 3 BHK with an office room." → Subjective: 3 BHK with office room\n- "I\'m looking for a 6 BHK duplex." → Subjective: 6 BHK duplex\n- "I need a 2.5 BHK." → Subjective: 2.5 BHK\n- "Either a 3 BHK villa or 4 BHK apartment." → Subjective: 3 BHK villa or 4 BHK apartment\nOne subtle rule I would keep: if the customer simply says "3 BHK", use the objective value 3_BHK. If they say "3 BHK with study room", prefer subjective text so the extra requirement is not lost.\nAnd if the customer only says "Not interested", this disposition should produce no extraction at all.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
      "Did the customer state or confirm whether they are buying the property for personal use, investment, or both?",
    systemPrompt:
      '"Identify the purpose of purchase explicitly stated or clearly confirmed by the customer.\n\nReturn one of these values:\n\nOWN_USE\nINVESTMENT\nBOTH\nNOT_SHARED\n\nOWN_USE - the customer says they are buying for themselves, their family, or to live in.\nINVESTMENT - the customer says they are buying as an investment, for rental income, or for resale/appreciation.\nBOTH - the customer says they are buying for both personal use and investment.\nNOT_SHARED - the customer does not explicitly state or confirm a purchase purpose.\n\nIf the customer does not explicitly state a purchase purpose, return NOT_SHARED. Never default to OWN_USE.\n\nExamples:\n\n""I want to buy a property."" -> NOT_SHARED\n""I\'m looking for a 2 BHK."" -> NOT_SHARED\n""I\'m not looking for property."" -> NOT_SHARED\n""I\'m buying it as an investment."" -> INVESTMENT\n""I\'m buying it for my family."" -> OWN_USE\n""Both investment and personal use."" -> BOTH\n\nDo not infer the purpose from configuration, budget, location, property type, or family size. Do not select a value merely because the agent suggested it; the customer must accept or confirm it.\n\nIf the customer changes or corrects the purpose during the call, return the final confirmed purpose.\n\nReturn only the value. Do not add explanations."',
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
      'Use only the customer\'s own stated or explicitly confirmed budget.\nDo not treat project pricing, unit pricing, offers, payment plans, EMI amounts, loan eligibility, or budget figures mentioned only by the agent as the customer\'s budget.\nDo not infer the customer\'s budget from their preferred configuration, property type, profession, income, location, purchase purpose, or any other information.\nIf the customer\'s stated budget clearly falls within one of the configured objective ranges, return the corresponding objective key.\nIf the customer\'s budget crosses multiple configured ranges, is highly specific, flexible around a threshold, conditional, or otherwise contains meaningful detail that would be lost by forcing it into one predefined range, return concise subjective text instead.\nIf the customer changes or corrects their budget during the conversation, use the final confirmed budget.\nIf the customer does not state or confirm any budget, return no value. Do not return NOT_SHARED, UNKNOWN, or infer the closest range.\nDo not guess.\n\nSubjective fallback behavior\nUse subjective text when the customer\'s budget contains important nuance that should not be lost.\nExamples:\n- "Around 90 lakhs to 1.1 crore." → Subjective: ₹90 lakh to ₹1.1 crore\n- "Around 1 crore, but I can stretch slightly." → Subjective: Around ₹1 crore, flexible slightly above\n- "For an apartment, up to 1.5 crore; for a villa, up to 2.5 crore." → Subjective: Apartment up to ₹1.5 crore; villa up to ₹2.5 crore\n- "Budget depends on the location." → Subjective: Budget depends on location\nAnd if the customer only says something like "Send me the details" or "I\'m not interested", this disposition should return no extraction.',
    model: "gpt-4o-mini",
    isSubjective: true,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't recieve any other objective values or customer didn't share or discuss about this disposition",
      },
    ],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: true,
  },
  {
    slug: "general-do-not-call",
    name: "general_do_not_call",
    displayName: "Do Not Call",
    tag: null,
    question:
      "Did the customer clearly ask not to be contacted or called again?",
    systemPrompt:
      "Use only the customer's own statements or explicit confirmation.\nThis disposition is intended to capture clear requests to stop future contact.\nReturn a value only when the customer explicitly asks not to be called or contacted again, asks to be removed from the calling/contact list, or otherwise clearly refuses future contact.\nDo not return a value merely because the customer:\n- says they are not interested,\n- is busy,\n- asks to be called later,\n- ends the current call,\n- rejects the current offer,\n- says they already purchased elsewhere,\n- or does not want to continue the current conversation.\nA rejection of the current opportunity is not automatically a Do Not Call request.\nIf the customer initially asks not to be contacted but later clearly withdraws that request, use the final confirmed intent.\nIf there is no clear request to stop future contact, return no value.\nDo not return NO. Do not guess.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "boolean",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "YES",
        condition:
          'Return YES only when the customer clearly requests that future calls or contact should stop. Examples: - "Do not call me again." - "Please remove my number from your list." - "Stop calling me." - "I don\'t want any more calls." - "Don\'t contact me again." - "Please delete my number." - "No more calls from your company." Do not return YES for statements such as: - "I\'m not interested." - "Not now." - "I\'m busy." - "Call me later." - "I already bought a property." If the condition is not clearly met, return no value.',
      },
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
      },
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
    question:
      "What language is the customer primarily speaking during the call?",
    systemPrompt:
      "Identify the customer's language from the customer's own speech only. Do not use the agent's language, campaign language, customer name, location, accent, or any other contextual information as evidence.\nReturn a value only when the customer's speech provides enough evidence to identify the language reliably.\nIf the customer uses more than one language, select the language they predominantly use during the meaningful part of the conversation.\nIf the customer speaks a non-English language but the specific language cannot be identified reliably after multiple usable utterances, return NON_ENGLISH_UNIDENTIFIED.\nIf there is not enough customer speech to determine the language at all, return NOT_DETERMINED.\nDo not guess.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
      "What is the customer's lead temperature based on their overall buying intent, engagement, purchase readiness, and next-step commitment?",
    systemPrompt:
      "Review the entire conversation and classify the customer based on their overall real-estate buying intent and readiness.\nUse only the customer's own statements, responses, requirements, questions, objections, timeline, and agreed actions.\nDo not classify based only on:\n- the agent's sales pitch,\n- project attractiveness,\n- agent enthusiasm,\n- one isolated statement,\n- or the fact that the customer answered the call.\nUse the customer's final state when their interest or intent changes during the conversation.\nLead temperature should reflect both interest and readiness to act.\nDo not classify a customer as HOT merely because they asked questions or requested details.\nDo not classify a customer as COLD merely because they are busy, have a long timeline, ask for a callback, or raise objections.\nUse NOT_APPLICABLE when there is not enough meaningful prospect interaction to assign a real lead temperature.\nReturn exactly one objective value.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [
      {
        value: "WARM",
        condition:
          'Return WARM when the customer shows genuine interest and is actively evaluating the opportunity but is not yet ready for an immediate decision. Typical indicators: - shares meaningful requirements, - asks relevant project questions, - requests details, - agrees to follow-up, - compares the project with other options, - has a realistic medium-term purchase intention. Examples: - "Send me the brochure, I\'m comparing a few projects." - "I\'m looking for a 3 BHK around this budget." - "I may buy within six months."',
      },
      {
        value: "HOT",
        condition:
          'Return HOT when the customer shows strong buying intent and is ready for an immediate or near-term action. Typical indicators: - agrees to or requests a site visit, - wants to speak with a consultant soon, - has a near-term purchase timeline, - discusses specific requirements and wants to proceed, - asks about booking, availability, negotiation, payment, or immediate next steps. Examples: - "I want to visit this weekend." - "Ask your consultant to call me today." - "I\'m planning to buy within two months."',
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
      {
        value: "NO_DATA",
        condition:
          "Only when we didn't receive any other objective values or customer didn't share or discuss about this disposition",
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
    question:
      "What single outcome best represents how the call ultimately ended?",
    systemPrompt:
      "Review the entire conversation and return exactly one final outcome that best represents the customer's final state or the actual reason the call ended.\nUse the customer's own statements, explicit confirmations, and the actual call interaction. Do not classify based only on actions proposed by the agent.\nThe final outcome is different from other dispositions such as customer interest, lead temperature, callback required, or consultant follow-up. Those may capture additional facts, while this disposition should identify the single primary outcome of the call.\nWhen several events occur during the conversation, use the most meaningful final or committed outcome, not every action that happened.\nFor example:\n- customer requests details and then confirms a site visit → SITE_VISIT\n- customer requests details and then agrees to a consultant call → CONSULTANT_FOLLOWUP\n- customer initially appears interested but finally says they are not interested → NOT_INTERESTED\n- customer says they are not interested and explicitly asks never to be called again → DO_NOT_CALL\nDo not force a positive sales outcome when the conversation does not support one.\nUse technical/contact outcomes such as NO_RESPONSE, WRONG_NUMBER, LANGUAGE_ISSUE, CALL_DROPPED, or INSUFFICIENT_CONVERSATION only when they accurately describe why a meaningful sales outcome could not be established.\nUse OTHER only when there is a clear meaningful outcome but none of the configured values reasonably represents it.\nReturn exactly one configured objective value.\n\nRecommended outcome priority\nWhen multiple outcomes genuinely apply, I would make the extraction follow this precedence logic:\nDO_NOT_CALL → SITE_VISIT → CONSULTANT_FOLLOWUP → CALLBACK_REQUESTED → SHARE_DETAILS → INTERESTED_NO_ACTION\nThe special-status outcomes such as ALREADY_PURCHASED, BROKER_OR_CHANNEL_PARTNER, WRONG_NUMBER, and LANGUAGE_ISSUE should be used whenever they are the actual reason the lead cannot proceed.",
    model: "gpt-4o-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
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
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
  },
];
