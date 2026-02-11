
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";
import { Send, RefreshCw, Share2, BellRing } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const SPREADSHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1Y9NE_QmtnMB612wjFhmjg8v2lAXsZfmlMtZIW_IiTuE/export?format=csv"; 

const parseCSV = (csv: string) => {
  const rows = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField.trim());
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        }
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];
  const validRows = rows.filter(r => r.some(cell => cell.trim() !== ''));
  if (validRows.length === 0) return [];
  
  const headers = validRows[0].map(h => h.toLowerCase().trim());
  return validRows.slice(1)
    .filter(row => row.length >= 2 && row[1] && row[1].trim() !== '')
    .map((row, rowIndex) => {
      const obj: any = { id: rowIndex }; 
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
};

const getSystemInstruction = (data: any[]) => `
Você é o "Carnabot", o guia oficial do Carnaval de Rua do Rio de Janeiro.
Planilha de dados: ${JSON.stringify(data, null, 2)}

DINÂMICA:
- Tom Padrão: Carioca raiz ("mermão", "coé").
- Modo Bicha Afrontosa: Se o usuário usar gírias LGBTQ+, mude para tom performático ("mona", "bicha", "arrasou").

REGRAS:
- Formato Vertical: Nome em Negrito, informações técnicas em lista, comentário final divertido.
- Instagram: Converta @nomedobloco em link clicável.
- Se houver mudanças recentes nos campos Local, Bairro ou Hora, mencione que a informação está fresquinha.
`;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  showNotificationButton?: boolean;
  hideTimestamp?: boolean;
}

declare global {
  interface Window {
    OneSignal: any;
  }
}

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [blocoCount, setBlocoCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initBot = async () => {
      try {
        const response = await fetch(SPREADSHEET_CSV_URL);
        const csvText = await response.text();
        const data = parseCSV(csvText);
        
        setBlocoCount(data.length);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const chat = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: { systemInstruction: getSystemInstruction(data) },
        });
        setChatSession(chat);

        setMessages([{
          id: '1',
          text: `Coé folião! **Carnabot** na área. 🎊\nTô com os blocos do Carnaval 2026 aqui. Qual a boa?\n\nAtiva as notificações para saber daquele bloco que anuncia a hora e o lugar de ultima hora!`,
          sender: 'bot',
          timestamp: new Date(),
          showNotificationButton: true,
          hideTimestamp: true
        }]);
      } catch (error) {
        console.error("Erro:", error);
      } finally {
        setIsFetchingData(false);
      }
    };
    initBot();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatSession || isLoading) return;
    const userText = inputText;
    const userMsg: Message = { id: Date.now().toString(), text: userText, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result = await chatSession.sendMessage({ message: userText });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: result.text || "Deu zebra aqui, mermão.",
        sender: 'bot',
        timestamp: new Date(),
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: 'err', text: "Pane no sistema! Tenta de novo.", sender: 'bot', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableNotifications = () => {
    // Dispara o prompt nativo do browser via OneSignal
    if (window.OneSignal) {
      window.OneSignal.Notifications.requestPermission()
        .then((permission: string) => {
          console.log("Permissão de notificação:", permission);
        })
        .catch((err: any) => {
          console.error("Erro ao pedir permissão:", err);
        });
    } else {
      alert("Serviço de notificação ainda carregando...");
    }
  };

  const getWhatsAppLink = (text: string) => {
    const cleanText = text.replace(/[*_#]/g, ''); 
    const footer = "\n\nInformação enviada pelo Carnabot RJ 2026 🎊";
    return `https://wa.me/?text=${encodeURIComponent(cleanText + footer)}`;
  };

  if (isFetchingData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#2b2b2b] text-white">
        <RefreshCw className="animate-spin mb-4 text-white" size={48} />
        <h1 className="text-xl font-bold">Lendo a planilha...</h1>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f0f2f5] font-sans overflow-hidden">
      <header className="bg-[#2b2b2b] text-white p-4 flex items-center justify-center shadow-lg z-10 border-b border-white/5 relative">
        <div className="text-center">
          <h1 className="text-xl font-black uppercase text-white">Carnabot 🎊</h1>
          <p className="text-[10px] font-bold mt-1 uppercase text-white/80">
            {blocoCount} blocos atualizados
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ddd5] relative" 
            style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}>
        <div className="max-w-2xl mx-auto w-full flex flex-col">
          {messages.map((msg) => {
            const isBlockInfo = msg.sender === 'bot' && (msg.text.toLowerCase().includes('local:') || msg.text.toLowerCase().includes('data:'));
            
            return (
              <div key={msg.id} className={`flex w-full mb-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-[18px] shadow-sm ${msg.sender === 'user' ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  <div className="prose prose-sm max-w-none text-[15px] leading-snug markdown-content">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                  
                  {msg.showNotificationButton && (
                    <button 
                      onClick={handleEnableNotifications}
                      className="mt-4 mb-2 flex items-center justify-center space-x-2 w-full py-3 bg-[#2b2b2b] hover:bg-[#1a1a1a] text-white font-black text-[12px] uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95"
                    >
                      <BellRing size={16} />
                      <span>Ativar Notificações</span>
                    </button>
                  )}

                  {isBlockInfo && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <a 
                        href={getWhatsAppLink(msg.text)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center space-x-2 w-full py-2.5 bg-[#25D366] hover:bg-[#1ebe57] text-white font-black text-[12px] uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 no-underline"
                      >
                        <Share2 size={16} />
                        <span>Mandar no Zap</span>
                      </a>
                    </div>
                  )}

                  {!msg.hideTimestamp && (
                    <div className="flex items-center justify-end mt-1 opacity-50">
                      <span className="text-[10px]">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white px-4 py-3 rounded-[18px] shadow-sm flex space-x-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0.4s'}}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="bg-white p-3 pb-8 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="max-w-2xl mx-auto flex items-end space-x-2">
          <div className="flex-1 bg-gray-100 rounded-[24px] px-4 py-2 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2b2b2b] transition-all">
             <textarea
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                placeholder="Fala tu..."
                className="w-full bg-transparent border-none focus:ring-0 text-base py-1 outline-none resize-none max-h-32"
              />
          </div>
          <button type="submit" className="p-4 rounded-full bg-[#2b2b2b] text-white active:scale-90 transition-all shadow-lg">
            <Send size={20} fill="currentColor" />
          </button>
        </form>
      </div>

      <style>{`
        .markdown-content p { margin-bottom: 0.5rem; white-space: pre-wrap; }
        .markdown-content strong { font-weight: 800; }
        .markdown-content a { color: #2b2b2b; font-weight: 600; text-decoration: underline; }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
