
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";
import { Send, Info, Menu, MoreVertical, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// --- CONFIGURAÇÃO DA PLANILHA ---
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
  
  const headers = validRows[0].map(h => h.toLowerCase());
  return validRows.slice(1)
    .filter(row => row.length >= 2 && row[1] && row[1].trim() !== '')
    .map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
};

const getSystemInstruction = (data: any[]) => `
Você é o "Carnabot", o guia oficial do Carnaval de Rua do Rio de Janeiro.
Sua única fonte de verdade absoluta é esta planilha:
${JSON.stringify(data, null, 2)}

REGRAS CRÍTICAS (LEIA COM ATENÇÃO):
1. PROIBIDO INVENTAR: Se a informação (bloco, local, horário) NÃO ESTIVER na planilha, você deve responder EXATAMENTE: "cara, não achei informação sobre isso". Não alucine.
2. FORMATO OBRIGATÓRIO (Vertical e Limpo):
**[NOME DO BLOCO]**
Local: [Local de Saída]
Bairro: [Extraia o bairro do endereço/local]
Horário: [Horário]
Data: [Nome do Dia] (dd/mm)

3. CALENDÁRIO CARNAVAL 2026:
- 12/02: Quinta
- 13/02: Sexta
- 14/02: Sábado
- 15/02: Domingo
- 16/02: Segunda
- 17/02: Terça
- 18/02: Quarta
SEMPRE use o formato "Nome do dia (dd/mm)". Ex: Sábado (14/02).

4. TOM DE VOZ: Use um estilo "carioca equilibrado". Seja amigável e descontraído, mas sem exagerar demais na caricatura. Pode usar gírias como "coé", "mermão", "papo reto", "beleza" e "tranquilo" de forma natural. O humor é bem-vindo, mas a precisão da informação vem primeiro.
5. Se o usuário perguntar "o que tem hoje" e hoje não for um dia de carnaval, procure na planilha o dia mais próximo ou diga "cara, não achei informação sobre isso para hoje".
`;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
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
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
      }

      try {
        const response = await fetch(SPREADSHEET_CSV_URL);
        const csvText = await response.text();
        const data = parseCSV(csvText);
        setBlocoCount(data.length);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const chat = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: {
            systemInstruction: getSystemInstruction(data),
          },
        });
        setChatSession(chat);

        setMessages([
          {
            id: '1',
            text: `Coé ${tg?.initDataUnsafe?.user?.first_name || 'folião'}! **Carnabot** na área. 🎊\n\nTô com a planilha oficial do Carnaval 2026 aqui. O que tu quer saber sobre os blocos? 🥁`,
            sender: 'bot',
            timestamp: new Date(),
          }
        ]);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        setMessages([
          {
            id: 'err',
            text: `Ih, deu algum ruim pra ler a planilha agora. Tenta de novo daqui a pouco!`,
            sender: 'bot',
            timestamp: new Date(),
          }
        ]);
      } finally {
        setIsFetchingData(false);
      }
    };

    initBot();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSubmit?: string) => {
    const text = textToSubmit || inputText;
    if (!text.trim() || !chatSession || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result = await chatSession.sendMessage({ message: text });
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: result.text || "cara, não achei informação sobre isso",
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Ih mermão, deu pane aqui. Tenta falar comigo de novo! 😅",
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetchingData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0088cc] text-white p-6 text-center">
        <RefreshCw className="animate-spin mb-4" size={48} />
        <h1 className="text-2xl font-bold mb-2">Peraí...</h1>
        <p className="opacity-80">Carregando os blocos do Carnaval 2026! 🥁</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#e7ebf0] font-sans overflow-hidden transition-colors duration-300" 
         style={{ backgroundColor: 'var(--tg-theme-bg-color, #e7ebf0)' }}>
      
      <header className="bg-[#0088cc] text-white p-3 flex items-center shadow-md z-10"
              style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #0088cc)', color: 'var(--tg-theme-text-color, #ffffff)' }}>
        <button className="p-2 hover:opacity-80 rounded-full transition-colors mr-2">
          <Menu size={24} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Carnabot 🎊</h1>
          <p className="text-xs opacity-80" style={{ color: 'var(--tg-theme-hint-color, #b3e0ff)' }}>{blocoCount} blocos no sistema</p>
        </div>
        <button className="p-2 hover:opacity-80 rounded-full transition-colors">
          <MoreVertical size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full mb-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] px-3 py-2 rounded-xl shadow-sm relative group transition-all duration-200 ${
                  msg.sender === 'user'
                    ? 'bg-[#effdde] text-gray-800 rounded-tr-none'
                    : 'bg-white text-gray-800 rounded-tl-none'
                }`}
                style={msg.sender === 'user' ? { 
                  backgroundColor: 'var(--tg-theme-button-color, #effdde)', 
                  color: 'var(--tg-theme-button-text-color, #000000)' 
                } : {
                  backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
                  color: 'var(--tg-theme-text-color, #000000)'
                }}
              >
                <div className="prose prose-sm max-w-none text-[15px] sm:text-base leading-snug break-words markdown-content">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 text-right select-none" style={{ color: 'var(--tg-theme-hint-color, #9ca3af)' }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className={`absolute top-0 w-2 h-2 ${
                  msg.sender === 'user' 
                    ? '-right-1 bg-[#effdde] rounded-bl-full' 
                    : '-left-1 bg-white rounded-br-full'
                }`} style={msg.sender === 'user' ? { backgroundColor: 'var(--tg-theme-button-color, #effdde)' } : { backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }} />
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start mb-2">
              <div className="bg-white px-4 py-2 rounded-xl rounded-tl-none shadow-sm flex items-center space-x-1" style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {!isLoading && (
        <div className="px-2 py-1 flex justify-center space-x-2 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => handleSendMessage("Quais os blocos da Quinta (12/02)?")}
            className="bg-white text-[#0088cc] px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:opacity-80 border border-[#0088cc]/20 transition-all whitespace-nowrap"
            style={{ color: 'var(--tg-theme-button-color, #0088cc)' }}
          >
            Quinta (12/02) 📅
          </button>
          <button 
            onClick={() => handleSendMessage("Blocos de Sábado (14/02)")}
            className="bg-white text-[#0088cc] px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:opacity-80 border border-[#0088cc]/20 transition-all whitespace-nowrap"
            style={{ color: 'var(--tg-theme-button-color, #0088cc)' }}
          >
            Sábado (14/02) 📍
          </button>
          <button 
            onClick={() => handleSendMessage("Me mostre blocos no Centro")}
            className="bg-white text-[#0088cc] px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm hover:opacity-80 border border-[#0088cc]/20 transition-all whitespace-nowrap"
            style={{ color: 'var(--tg-theme-button-color, #0088cc)' }}
          >
            Centro 🏘️
          </button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 p-2 sm:p-4 pb-4 sm:pb-6" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #ffffff)', borderTopColor: 'var(--tg-theme-hint-color, #e5e7eb)' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="max-w-3xl mx-auto flex items-end space-x-2">
          <div className="flex-1 relative flex items-center bg-gray-100 rounded-2xl px-3 py-1 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#0088cc] transition-all"
               style={{ backgroundColor: 'var(--tg-theme-bg-color, #f3f4f6)' }}>
             <button type="button" className="p-2 text-gray-400 hover:text-[#0088cc] transition-colors">
                <Info size={20} />
             </button>
             <textarea
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Fala tu..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm sm:text-base py-2 resize-none max-h-32 placeholder:text-gray-400"
                style={{ color: 'var(--tg-theme-text-color, #000000)' }}
              />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className={`p-3 rounded-full flex items-center justify-center transition-all ${
              !inputText.trim() || isLoading
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-[#0088cc] text-white hover:opacity-90 shadow-md active:scale-95'
            }`}
            style={inputText.trim() && !isLoading ? { backgroundColor: 'var(--tg-theme-button-color, #0088cc)', color: 'var(--tg-theme-button-text-color, #ffffff)' } : {}}
          >
            <Send size={20} />
          </button>
        </form>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .markdown-content p {
          margin-bottom: 0.25rem;
          white-space: pre-wrap;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content strong {
          font-weight: 700;
          color: inherit;
        }
        .markdown-content hr {
          margin: 1rem 0;
          border: 0;
          border-top: 1px dashed rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
