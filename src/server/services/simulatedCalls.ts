/**
 * Pakka Note: Yani Call Spectator - Scripted Synthetic Two-Speaker Calls
 *
 * SPECIFICATION REQUIREMENTS (SECTION 11, ITEM 11 & SECTION 14):
 * At least three scripted two-speaker synthetic calls:
 * 1. Clean call: customer shares name, mobile, email, order ID, postal PIN.
 * 2. Noisy / telephony call: customer shares IMEI, mobile, serial number.
 * 3. Correction call: customer states identifier, then corrects ("no, it is 4 not 5"),
 *    superseding earlier value while keeping history.
 *
 * All simulated calls replay with realistic timing through the EXACT same backend pipeline,
 * and are labeled 'Simulated' everywhere.
 * NEVER uses real customer recordings or personal data.
 */

import type { EntityType, Speaker } from '../../types/index.ts';

export interface ScriptedTurn {
  speaker: Speaker;
  text: string;
  verbatimText?: string;
  delayMs: number;
}

export interface ScriptedCallDefinition {
  scriptId: string;
  title: string;
  condition: 'clean' | 'degraded_telephony' | 'correction_scenario';
  description: string;
  expectedGroundTruth: Array<{
    type: EntityType;
    expectedValue: string;
    description: string;
  }>;
  turns: ScriptedTurn[];
}

export const SCRIPTED_CALLS: Record<string, ScriptedCallDefinition> = {
  clean_support_call: {
    scriptId: 'clean_support_call',
    title: 'Clean E-Commerce Support Order Verification',
    condition: 'clean',
    description: 'Clean acoustic audio. Customer inquires about delivery and shares name, phone, email, order ID, and PIN.',
    expectedGroundTruth: [
      { type: 'name', expectedValue: 'Rahul Sharma', description: 'Customer full name' },
      { type: 'mobile', expectedValue: '9876543210', description: 'Customer mobile number' },
      { type: 'email', expectedValue: 'rahul.sharma@gmail.com', description: 'Customer email' },
      { type: 'order_id', expectedValue: 'ORD12345678', description: 'Order ID' },
      { type: 'postal_pin', expectedValue: '560001', description: 'Bangalore PIN' },
    ],
    turns: [
      {
        speaker: 'agent',
        text: 'Thank you for calling Acme Support. My name is Amit. How can I help you today?',
        delayMs: 800,
      },
      {
        speaker: 'customer',
        text: 'Hi Amit, this is Rahul Sharma. I want to check on my replacement shipment.',
        delayMs: 1600,
      },
      {
        speaker: 'agent',
        text: 'Hello Mr. Sharma, I can check that right away. Could you share your order ID and registered mobile number?',
        delayMs: 1500,
      },
      {
        speaker: 'customer',
        text: 'Sure, my order ID is ORD 1 2 3 4 5 6 7 8, and my mobile number is nine eight seven six five four three two one zero.',
        delayMs: 2400,
      },
      {
        speaker: 'agent',
        text: 'Got both of those. Could I also confirm your email address and delivery postal PIN for verification?',
        delayMs: 1500,
      },
      {
        speaker: 'customer',
        text: 'Yes, my email is rahul dot sharma at the rate gmail dot com, and my delivery pin is five six zero zero zero one.',
        delayMs: 2200,
      },
      {
        speaker: 'agent',
        text: 'Thank you Rahul. Let me read that back: order ORD12345678, mobile 98765 43210, PIN 560 001. Is that all correct?',
        delayMs: 2000,
      },
      {
        speaker: 'customer',
        text: 'Yes, exactly right. That is correct.',
        delayMs: 1200,
      },
      {
        speaker: 'agent',
        text: 'Your replacement package is dispatched and arriving tomorrow. Have a great day!',
        delayMs: 1400,
      },
    ],
  },

  noisy_device_call: {
    scriptId: 'noisy_device_call',
    title: 'Telephony Device Replacement (IMEI & Serial)',
    condition: 'degraded_telephony',
    description: 'Telephony bandwidth. Customer shares 15-digit IMEI with Luhn check, mobile, and hardware serial with NATO phonetics.',
    expectedGroundTruth: [
      { type: 'imei', expectedValue: '490154203237518', description: 'Valid 15-digit Luhn IMEI' },
      { type: 'mobile', expectedValue: '9123456780', description: 'Customer mobile' },
      { type: 'service_tag', expectedValue: 'SERKLBZA', description: 'NATO hardware tag' },
    ],
    turns: [
      {
        speaker: 'agent',
        text: 'Hardware warranty desk, this is Priya. Please provide your device identifiers.',
        delayMs: 800,
      },
      {
        speaker: 'customer',
        text: 'Hello, my tablet screen has lines on it. You can reach me on mobile nine one two three four five six seven eight zero.',
        delayMs: 2000,
      },
      {
        speaker: 'agent',
        text: 'Understood. Please read out the 15-digit IMEI printed under the battery tray.',
        delayMs: 1500,
      },
      {
        speaker: 'customer',
        text: 'The IMEI number is four nine zero one five four two zero three two three seven five one eight.',
        delayMs: 2800,
      },
      {
        speaker: 'agent',
        text: 'Checking... Luhn checksum verified. Could you also spell the 8-character service tag?',
        delayMs: 1600,
      },
      {
        speaker: 'customer',
        text: 'Yes, tag is Sierra Echo Romeo Kilo Lima Bravo Zulu Alpha.',
        delayMs: 2200,
      },
      {
        speaker: 'agent',
        text: 'Captured SERKLBZA. I am creating a warranty replacement ticket for your device right now.',
        delayMs: 1500,
      },
      {
        speaker: 'customer',
        text: 'Haan sahi hai, thank you very much.',
        delayMs: 1000,
      },
    ],
  },

  spoken_correction_call: {
    scriptId: 'spoken_correction_call',
    title: 'Spoken Correction Mid-Call (Supersession)',
    condition: 'correction_scenario',
    description: 'Customer makes a verbal error, then catches themselves and corrects it mid-call. Tests candidate supersession and history preservation.',
    expectedGroundTruth: [
      { type: 'postal_pin', expectedValue: '560004', description: 'Corrected postal PIN (superseded 560005)' },
      { type: 'mobile', expectedValue: '9876543217', description: 'Corrected mobile (superseded 9876543210)' },
    ],
    turns: [
      {
        speaker: 'agent',
        text: 'Support desk. Please state your delivery PIN and contact number.',
        delayMs: 800,
      },
      {
        speaker: 'customer',
        text: 'My postal PIN is five six zero zero zero five.',
        delayMs: 1800,
      },
      {
        speaker: 'customer',
        text: 'Oh sorry, no, it is 4 not 5. The pin is five six zero zero zero four.',
        delayMs: 2200,
      },
      {
        speaker: 'agent',
        text: 'Understood, updated PIN to 560 004. What is your contact phone number?',
        delayMs: 1500,
      },
      {
        speaker: 'customer',
        text: 'Call me on nine eight seven six five four three two one zero.',
        delayMs: 2200,
      },
      {
        speaker: 'customer',
        text: 'Wait, sorry, last digit is 7! Nine eight seven six five four three two one seven.',
        delayMs: 2200,
      },
      {
        speaker: 'agent',
        text: 'Got the correction: mobile ends in 7, PIN is 560004. Is that right?',
        delayMs: 1500,
      },
      {
        speaker: 'customer',
        text: 'Yes, pakka, that is the correct one now.',
        delayMs: 1200,
      },
    ],
  },
};
