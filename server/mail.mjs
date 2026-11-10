// Transactional delivery only. Lists and consent remain in TAGAI's database.
export const emailReady=env=>!!(env.RESEND_API_KEY&&env.EMAIL_FROM&&env.EMAIL_DELIVERY_ENABLED==='1');
export async function sendMail({to,subject,text,id,replyTo},env,fetcher=fetch){
 if(!emailReady(env))return 'not_configured';
 try{const r=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject,text,...(replyTo?{reply_to:replyTo}:{})}),signal:AbortSignal.timeout(9000)});if(!r.ok)return 'failed';const d=await r.json();return typeof d.id==='string'?'sent':'failed';}catch{return 'failed';}
}
export function confirmationMail(email,language,selected,cities,token,access=false){
 const url=`https://tagai.art/${language}/manage/#token=${token}`;
 const names={app:'App early access',updates:'Project updates',visits:'Artist visits'};
 const choice=selected.map(s=>names[s]).join(', ');
 let subject=access?'Your TAGAI subscription preferences':selected.includes('app')?'Confirm your TAGAI waitlist signup':selected.includes('visits')?'Confirm your artist visit announcements':'Confirm your TAGAI project updates';
 let body=access?'Use this secure link to view and change your TAGAI subscriptions.':selected.includes('app')?'You asked to join the TAGAI waitlist.\n\nConfirm your email and we’ll let you know when early access opens. The app is planned to launch in March 2027.':selected.includes('visits')?'You asked to hear about TAGAI’s private artist visits.\n\nThe first cities will be Nicosia, Limassol and Paris. Confirm your email to receive announcements as visits are confirmed.':'You asked to receive occasional updates about TAGAI as we prepare for launch in March 2027.';
 if(language==='fr'){subject=access?'Vos préférences TAGAI':'Confirmez votre inscription TAGAI';body=access?'Utilisez ce lien sécurisé pour consulter et modifier vos abonnements TAGAI.':'Vous avez demandé à recevoir des informations de TAGAI. Confirmez votre e-mail pour activer les abonnements sélectionnés. Le lancement de l’application est prévu en mars 2027.';}
 if(language==='el'){subject=access?'Οι προτιμήσεις σας στο TAGAI':'Επιβεβαιώστε την εγγραφή σας στο TAGAI';body=access?'Χρησιμοποιήστε τον ασφαλή σύνδεσμο για να δείτε και να αλλάξετε τις συνδρομές σας στο TAGAI.':'Ζητήσατε ενημερώσεις από το TAGAI. Επιβεβαιώστε το email σας για να ενεργοποιήσετε τις επιλεγμένες συνδρομές. Η εφαρμογή προγραμματίζεται για τον Μάρτιο του 2027.';}
 const ignore=language==='fr'?'Si vous n’avez pas fait cette demande, ignorez cet e-mail.':language==='el'?'Αν δεν κάνατε αυτό το αίτημα, αγνοήστε αυτό το email.':'If you didn’t request this, you can ignore this email.';
 return {to:email,subject,text:body+'\n\n'+url+(access?'':'\n\nYour selection: '+choice+'.'+(cities.length?'\nSelected cities: '+cities.join(', '):''))+'\n\n'+ignore};
}
