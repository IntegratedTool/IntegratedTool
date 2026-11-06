import type { Announcement } from './types';

export const sampleAnnouncements: Announcement[] = [
  {
    id: 's1',
    title: {
      en: 'Sample notice: planned maintenance window',
      ta: 'மாதிரி அறிவிப்பு: திட்டமிடப்பட்ட பராமரிப்பு நேரம்',
    },
    summary: {
      en: 'Placeholder text showing how a planned service interruption notice will appear. Replace with an approved announcement from the administration console.',
      ta: 'திட்டமிடப்பட்ட சேவைத் தடை அறிவிப்பு எவ்வாறு தோன்றும் என்பதைக் காட்டும் மாதிரி உரை. நிர்வாகக் கட்டுப்பாட்டுப் பலகையிலிருந்து அங்கீகரிக்கப்பட்ட அறிவிப்பால் மாற்றவும்.',
    },
    publishedOn: '2026-10-20',
    priority: 'high',
    isSample: true,
  },
  {
    id: 's2',
    title: {
      en: 'Sample notice: new service for dealers',
      ta: 'மாதிரி அறிவிப்பு: வணிகர்களுக்கான புதிய சேவை',
    },
    summary: {
      en: 'Placeholder text for a new-service or user-instruction notice. It can carry an attachment such as an approved circular.',
      ta: 'புதிய சேவை அல்லது பயனர் வழிமுறை அறிவிப்புக்கான மாதிரி உரை. அங்கீகரிக்கப்பட்ட சுற்றறிக்கை போன்ற இணைப்பையும் கொண்டிருக்கலாம்.',
    },
    publishedOn: '2026-10-15',
    priority: 'normal',
    isSample: true,
  },
  {
    id: 's3',
    title: {
      en: 'Sample notice: helpdesk working hours',
      ta: 'மாதிரி அறிவிப்பு: உதவி மைய பணி நேரம்',
    },
    summary: {
      en: 'Placeholder text for general service information. Working hours will be published once approved by the department.',
      ta: 'பொதுச் சேவைத் தகவலுக்கான மாதிரி உரை. துறையின் ஒப்புதலுக்குப் பின் பணி நேரம் வெளியிடப்படும்.',
    },
    publishedOn: '2026-10-08',
    priority: 'info',
    isSample: true,
  },
  {
    id: 's4',
    title: {
      en: 'Sample notice: important deadline reminder',
      ta: 'மாதிரி அறிவிப்பு: முக்கிய காலக்கெடு நினைவூட்டல்',
    },
    summary: {
      en: 'Placeholder text for a public notice about a relevant deadline. Dates and details must come from an approved source.',
      ta: 'தொடர்புடைய காலக்கெடு குறித்த பொது அறிவிப்புக்கான மாதிரி உரை. தேதிகளும் விவரங்களும் அங்கீகரிக்கப்பட்ட மூலத்திலிருந்து வர வேண்டும்.',
    },
    publishedOn: '2026-10-01',
    priority: 'normal',
    isSample: true,
  },
];

