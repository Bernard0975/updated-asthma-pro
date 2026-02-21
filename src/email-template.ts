export interface EmailTemplateProps {
  locationName: string;
  riskLevel: string;
  riskBgColor: string;
  triggers: string[];
  advice: string[];
}

export function generateEmailHtml({ locationName, riskLevel, riskBgColor, triggers, advice }: EmailTemplateProps): string {
  const bgColor = riskBgColor === 'bg-rose-50' ? '#fff1f2' : riskBgColor === 'bg-orange-50' ? '#fff7ed' : '#f0fdf4';
  
  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
      <div style="background-color: #4f46e5; padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -0.02em;">AsthmaGuard Alert</h1>
      </div>
      <div style="padding: 32px;">
        <p style="font-size: 18px; color: #1e293b; margin-bottom: 24px;">Hello, we've detected environmental conditions in <strong>${locationName}</strong> that may affect your breathing.</p>
        
        <div style="background-color: ${bgColor}; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
          <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #0f172a;">Risk Level: ${riskLevel}</h2>
          <p style="margin: 0; color: #475569; font-size: 14px;"><strong>Triggers Detected:</strong> ${triggers.join(", ")}</p>
        </div>

        <h3 style="font-size: 16px; color: #0f172a; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">Precautions to Take</h3>
        <ul style="padding-left: 20px; color: #334155; line-height: 1.6;">
          ${advice.map(a => `<li style="margin-bottom: 12px;">${a}</li>`).join("")}
        </ul>

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-top: 32px;">
          <p style="margin: 0; font-size: 14px; color: #64748b; font-style: italic;">
            "Your health is our priority. Stay safe, stay prepared, and breathe easy."
          </p>
        </div>

        <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #f1f5f9; text-align: center;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated health alert from AsthmaGuard.</p>
          <p style="font-size: 11px; color: #cbd5e1; margin-top: 8px;">To opt out of future alerts, please visit the app settings.</p>
        </div>
      </div>
    </div>
  `;
}
