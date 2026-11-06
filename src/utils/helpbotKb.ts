/**
 * Offline question-and-answer bank for the Help assistant. It matches keywords; it is not an AI model, it never sends
 * anything to a server and it cannot see anyone's tickets. Numbers mirror the default console settings.
 * Tamil text needs review by a native speaker.
 */
export type BotLang = 'en' | 'ta';
interface L { en: string; ta: string }
export interface KbEntry { id: string; topic: L; keys: string[]; answer: L }

export const KB: KbEntry[] = [
  { id: 'raise', topic: { en: 'How to raise a ticket', ta: 'புகார் பதிவு செய்வது எப்படி' },
    keys: ['raise', 'create', 'new ticket', 'register', 'complaint', 'issue', 'problem', 'பதிவு', 'புகார்'],
    answer: {
      en: 'Sign in, choose “Raise a Ticket”, pick the Nature of Issue and Issue Category, describe the case in 20 to 1,000 words, attach up to 2 PDF/JPG files if needed and submit. You get a reference number starting with E (EoBC) or H (Help Desk).',
      ta: 'உள்நுழைந்து “புகார் பதிவு செய்” என்பதைத் தேர்ந்தெடுக்கவும்; பிரச்சினையின் வகை மற்றும் பிரிவைத் தேர்வு செய்து, 20 முதல் 1,000 சொற்களில் விவரிக்கவும்; தேவையெனில் 2 PDF/JPG கோப்புகள் வரை இணைத்துச் சமர்ப்பிக்கவும். E (EoBC) அல்லது H (உதவி மையம்) எனத் தொடங்கும் குறிப்பு எண் கிடைக்கும்.' } },
  { id: 'track', topic: { en: 'Track my ticket', ta: 'எனது புகாரின் நிலை' },
    keys: ['track', 'status', 'where is', 'reference', 'நிலை', 'குறிப்பு எண்'],
    answer: {
      en: 'Open “My Raised Tickets” and select the ticket. The progress bar shows New → In Progress → Resolved → Closed, and the Action History (latest first) lists every step with date and time.',
      ta: '“நான் பதிவு செய்த புகார்கள்” என்பதைத் திறந்து புகாரைத் தேர்ந்தெடுக்கவும். முன்னேற்றப் பட்டி புதியது → நடவடிக்கையில் → தீர்க்கப்பட்டது → மூடப்பட்டது என்பதைக் காட்டும்; நடவடிக்கை வரலாற்றில் (சமீபத்தியது முதலில்) ஒவ்வொரு படியும் தேதி, நேரத்துடன் இருக்கும்.' } },
  { id: 'withdraw', topic: { en: 'Withdraw a ticket', ta: 'புகாரைத் திரும்பப் பெறுதல்' },
    keys: ['withdraw', 'cancel', 'delete', 'remove', 'திரும்ப', 'ரத்து'],
    answer: {
      en: 'You can withdraw a ticket only while its status is New (nobody has started work). Open the ticket and choose “Withdraw Ticket”, giving a reason. Once work has started, add a comment instead.',
      ta: 'புகாரின் நிலை “புதியது” ஆக இருக்கும்போது (இன்னும் பணி தொடங்காதபோது) மட்டுமே திரும்பப் பெறலாம். புகாரைத் திறந்து “புகாரைத் திரும்பப் பெறு” என்பதைத் தேர்ந்தெடுத்து காரணம் தரவும். பணி தொடங்கிவிட்டால் கருத்தைச் சேர்க்கவும்.' } },
  { id: 'reopen', topic: { en: 'Reopen or closure', ta: 'மீண்டும் திறத்தல் / மூடல்' },
    keys: ['reopen', 'closed', 'close', 'resolved', 'not satisfied', 'மீண்டும்', 'மூட'],
    answer: {
      en: 'When a ticket is Resolved you can reopen it within 7 days if the problem is not fixed. If it is not reopened it is closed automatically after 7 days. Only the Super Admin can close a Resolved ticket earlier. A Closed or Withdrawn ticket cannot be reopened.',
      ta: 'புகார் “தீர்க்கப்பட்டது” நிலையில் இருக்கும்போது பிரச்சினை தீரவில்லை எனில் 7 நாட்களுக்குள் மீண்டும் திறக்கலாம். திறக்கப்படாவிட்டால் 7 நாட்களுக்குப் பின் தானாக மூடப்படும். முன்கூட்டியே மூட சூப்பர் அட்மினால் மட்டுமே இயலும். மூடப்பட்ட அல்லது திரும்பப் பெறப்பட்ட புகாரை மீண்டும் திறக்க இயலாது.' } },
  { id: 'comment', topic: { en: 'Add more information', ta: 'கூடுதல் தகவல் சேர்த்தல்' },
    keys: ['comment', 'query', 'more information', 'add information', 'update', 'கருத்து', 'தகவல்'],
    answer: {
      en: 'Open the ticket and use “Add a comment or query”. It is added to the Action History and cannot be edited. Comments are possible until the ticket is Closed or Withdrawn.',
      ta: 'புகாரைத் திறந்து “கருத்து அல்லது வினாவைச் சேர்க்கவும்” என்பதைப் பயன்படுத்தவும். அது நடவடிக்கை வரலாற்றில் சேரும்; திருத்த இயலாது. புகார் மூடப்படும் வரை அல்லது திரும்பப் பெறப்படும் வரை கருத்து சேர்க்கலாம்.' } },
  { id: 'files', topic: { en: 'Attachment rules', ta: 'இணைப்பு விதிகள்' },
    keys: ['attach', 'file', 'upload', 'pdf', 'jpg', 'jpeg', 'size', 'இணை', 'கோப்பு'],
    answer: {
      en: 'Only PDF and JPG/JPEG files are accepted: up to 2 files, 5 MB each and 10 MB in total, each with a different name. The file is checked by its real content, so renaming another type to .pdf or .jpg will not work. PDFs that contain scripts are refused. (Limits may be changed by the administrator.)',
      ta: 'PDF மற்றும் JPG/JPEG கோப்புகள் மட்டும்: 2 கோப்புகள் வரை, ஒவ்வொன்றும் 5 MB, மொத்தம் 10 MB, ஒவ்வொன்றுக்கும் வேறு பெயர். கோப்பின் உண்மையான உள்ளடக்கம் சரிபார்க்கப்படும்; வேறு வகையை .pdf அல்லது .jpg என மறுபெயரிட்டால் ஏற்கப்படாது. ஸ்கிரிப்ட் உள்ள PDF ஏற்கப்படாது. (வரம்புகளை நிர்வாகி மாற்றலாம்.)' } },
  { id: 'otp', topic: { en: 'OTP problems', ta: 'OTP சிக்கல்கள்' },
    keys: ['otp', 'code', 'resend', 'sms', 'expired', 'locked', 'ஓடிபி', 'குறியீடு'],
    answer: {
      en: 'The OTP is valid for a short time. You can enter a wrong OTP at most 3 times and ask for a resend at most 3 times, with a short wait between resends. After that, wait 20 minutes and start again.',
      ta: 'OTP குறுகிய நேரமே செல்லுபடியாகும். தவறான OTP அதிகபட்சம் 3 முறை உள்ளிடலாம்; மீண்டும் அனுப்பக் கோருவது அதிகபட்சம் 3 முறை, ஒவ்வொன்றுக்கும் இடையே சிறிது காத்திருக்க வேண்டும். அதன் பின் 20 நிமிடம் காத்திருந்து மீண்டும் தொடங்கவும்.' } },
  { id: 'gstin', topic: { en: 'GSTIN / TIN format', ta: 'GSTIN / TIN வடிவம்' },
    keys: ['gstin', 'gst', 'tin', 'invalid', 'format', 'number', 'dealer', 'வரி', 'எண்'],
    answer: {
      en: 'GSTIN has 15 characters: 2-digit state code (33 for Tamil Nadu), 10-character PAN, a number 1–9 or letter for the entity, the letter Z, and a check character. TIN has 11 digits and starts with the 2-digit state code. If sign-in says the number is not valid, re-check each character.',
      ta: 'GSTIN 15 எழுத்துகள்: 2 இலக்க மாநிலக் குறியீடு (தமிழ்நாடு 33), 10 எழுத்து PAN, நிறுவனத்திற்கு 1–9 அல்லது எழுத்து, Z என்ற எழுத்து, ஒரு சரிபார்ப்பு எழுத்து. TIN 11 இலக்கங்கள்; முதல் 2 இலக்கம் மாநிலக் குறியீடு. எண் செல்லாது எனக் காட்டினால் ஒவ்வொரு எழுத்தையும் சரிபார்க்கவும்.' } },
  { id: 'password', topic: { en: 'Forgot password (officers)', ta: 'கடவுச்சொல் மறந்தால்' },
    keys: ['password', 'forgot', 'reset', 'login', 'sign in', 'cannot login', 'கடவுச்சொல்', 'மறந்த'],
    answer: {
      en: 'Officers can use “Forgot password” on the sign-in page. After a wrong password a CAPTCHA appears; too many wrong attempts lock the account for a while. Never share your password with anyone, including the help desk.',
      ta: 'அதிகாரிகள் உள்நுழைவுப் பக்கத்தில் “கடவுச்சொல் மறந்துவிட்டதா” என்பதைப் பயன்படுத்தலாம். தவறான கடவுச்சொல்லுக்குப் பின் CAPTCHA தோன்றும்; பல தவறுகளுக்குப் பின் கணக்கு சிறிது நேரம் பூட்டப்படும். கடவுச்சொல்லை உதவி மையம் உட்பட யாருடனும் பகிர வேண்டாம்.' } },
  { id: 'duplicate', topic: { en: '“Similar ticket” warning', ta: '“ஒத்த புகார்” எச்சரிக்கை' },
    keys: ['duplicate', 'similar', 'repeat', 'same ticket', 'warning', 'ஒத்த', 'மீண்டும் மீண்டும்'],
    answer: {
      en: 'If your new case is very similar to one of your open tickets of the same type, the portal shows that ticket. Open it and add a comment instead. If it really is a different issue, you may confirm and submit anyway (unless the administrator has switched on blocking).',
      ta: 'உங்கள் புதிய புகார், அதே வகையில் உள்ள உங்கள் திறந்த புகாருடன் மிகவும் ஒத்திருந்தால் அந்தப் புகாரை போர்டல் காட்டும். அதைத் திறந்து கருத்தைச் சேர்க்கவும். உண்மையிலேயே வேறு பிரச்சினை எனில் உறுதிசெய்து சமர்ப்பிக்கலாம் (நிர்வாகி தடை செய்திருந்தால் தவிர).' } },
  { id: 'who', topic: { en: 'Who handles my ticket', ta: 'என் புகாரை யார் கவனிக்கிறார்' },
    keys: ['who', 'assigned', 'officer', 'handle', 'resolver', 'யார்', 'அதிகாரி'],
    answer: {
      en: 'Tickets are routed automatically from the issue classification to the responsible wing (EoBC or Help Desk) and officer. For dealers the officer’s name is not shown; you will see every action in the history.',
      ta: 'பிரச்சினை வகைப்பாட்டின் அடிப்படையில் புகார் பொறுப்புள்ள பிரிவு (EoBC அல்லது உதவி மையம்) மற்றும் அதிகாரிக்குத் தானாக அனுப்பப்படும். வணிகர்களுக்கு அதிகாரியின் பெயர் காட்டப்படாது; வரலாற்றில் ஒவ்வொரு நடவடிக்கையையும் காணலாம்.' } },
  { id: 'access', topic: { en: 'Language, dark mode, text size', ta: 'மொழி, இருள் பயன்முறை, எழுத்து அளவு' },
    keys: ['language', 'tamil', 'english', 'dark', 'theme', 'colour', 'color', 'text size', 'font', 'contrast', 'accessib', 'மொழி', 'தமிழ்'],
    answer: {
      en: 'Use Tamil / English at the top right to change language. The accessibility icon beside it opens options for Light/Dark theme, colour scheme, text size, high contrast and underlined links.',
      ta: 'மொழியை மாற்ற மேலே வலப்புறம் உள்ள தமிழ் / English ஐப் பயன்படுத்தவும். அதன் அருகிலுள்ள அணுகல்தன்மை ஐகான் ஒளி/இருள் தீம், வண்ணத் திட்டம், எழுத்து அளவு, உயர் மாறுபாடு, இணைப்புகளுக்கு அடிக்கோடு ஆகியவற்றைத் தரும்.' } },
  { id: 'contact', topic: { en: 'Contact the help desk', ta: 'உதவி மையத்தைத் தொடர்பு கொள்ள' },
    keys: ['contact', 'phone', 'email', 'help desk', 'helpdesk', 'support', 'call', 'தொடர்பு', 'உதவி'],
    answer: {
      en: 'The Helpdesk support panel on the sign-in page lists the contact e-mail and FAQ link once they are published. For a specific ticket, add a comment to it so the officer sees your message with the history.',
      ta: 'தொடர்பு மின்னஞ்சல் மற்றும் FAQ இணைப்பு வெளியிடப்பட்டதும் உள்நுழைவுப் பக்கத்தின் “உதவி மைய ஆதரவு” பகுதியில் இடம்பெறும். குறிப்பிட்ட புகாருக்கு, அதில் கருத்தைச் சேருங்கள்; அப்போது அதிகாரி உங்கள் செய்தியை வரலாற்றுடன் காண்பார்.' } },
];

export const GREETING: L = {
  en: 'Hello! I can answer common questions about using this help desk. Pick a topic below or type your question. I cannot see or change your tickets, and I do not give tax or legal advice. Please do not type passwords, OTPs or personal details here.',
  ta: 'வணக்கம்! இந்த உதவி மையத்தைப் பயன்படுத்துவது குறித்த பொதுவான கேள்விகளுக்கு நான் பதிலளிக்க முடியும். கீழே ஒரு தலைப்பைத் தேர்ந்தெடுக்கவும் அல்லது கேள்வியை உள்ளிடவும். உங்கள் புகார்களை என்னால் பார்க்கவோ மாற்றவோ இயலாது; வரி அல்லது சட்ட ஆலோசனையும் தர மாட்டேன். கடவுச்சொல், OTP, தனிப்பட்ட விவரங்களை இங்கு உள்ளிட வேண்டாம்.',
};
export const FALLBACK: L = {
  en: 'I could not find an answer to that. Try one of the topics below, or raise a ticket / add a comment to an existing one so an officer can help.',
  ta: 'அதற்கான பதில் என்னிடம் இல்லை. கீழுள்ள தலைப்புகளில் ஒன்றை முயலவும், அல்லது அதிகாரி உதவ புகார் பதிவு செய்யவும் / உள்ள புகாரில் கருத்தைச் சேர்க்கவும்.',
};

/** Best entry for a free-text question, or null. Longer keywords count for more so “reset” beats “set”. */
export function bestAnswer(text: string): KbEntry | null {
  const q = text.toLowerCase().trim();
  if (q.length < 2) return null;
  let best: KbEntry | null = null;
  let top = 0;
  for (const e of KB) {
    let score = 0;
    for (const k of e.keys) if (q.includes(k.toLowerCase())) score += k.length;
    if (score > top) { top = score; best = e; }
  }
  return best;
}
