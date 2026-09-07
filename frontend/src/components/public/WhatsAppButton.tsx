import { MessageCircle } from "lucide-react";

export default function WhatsAppButton() {
  return (
    <button
      onClick={() => alert("Pr\u00f3ximamente podr\u00e1s contactarnos por WhatsApp. \u00a1Por ahora escr\u00edbenos a contacto@repuestopro.com!")}
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transition-all hover:scale-110 cursor-pointer"
      title="Contactar por WhatsApp"
    >
      <MessageCircle size={22} className="text-foreground sm:w-[26px] sm:h-[26px]" />
    </button>
  );
}
