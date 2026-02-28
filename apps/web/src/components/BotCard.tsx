import { Bot, Power, Settings, TrendingUp, TrendingDown } from "lucide-react";
import type { BotConfig } from "@repo/bot-config";

interface BotCardProps {
  bot: BotConfig;
  onToggle: (id: string) => void;
  onEdit: (bot: BotConfig) => void;
}

export function BotCard({ bot, onToggle, onEdit }: BotCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${bot.positionSide === "LONG" ? "bg-green-100" : "bg-red-100"}`}
          >
            {bot.positionSide === "LONG" ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{bot.symbol}</h3>
            <p className="text-sm text-gray-500">{bot.positionSide}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(bot)}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggle(bot.PK)}
            className={`p-2 rounded-lg transition-colors ${
              bot.enabled
                ? "text-green-600 bg-green-50 hover:bg-green-100"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Base Order</p>
          <p className="font-medium">
            {bot.equity.size
              ? `${bot.equity.size} USDT`
              : `${bot.equity.percentage}%`}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Take Profit</p>
          <p className="font-medium">
            {(bot.takeProfit.percentage * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-gray-500">Leverage</p>
          <p className="font-medium">{bot.equity.maxLeverage}x</p>
        </div>
        <div>
          <p className="text-gray-500">Status</p>
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              bot.enabled
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {bot.enabled ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
    </div>
  );
}
