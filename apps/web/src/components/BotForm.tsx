import { X, Save } from "lucide-react";
import {  BotConfigCreateSchema, BotConfigSchema, type BotConfig, type BotConfigCreate } from '@repo/bot-config'
import { useForm, Form } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

interface BotFormProps {
  bot?: BotConfigCreate | BotConfig;
  onSave: (bot: BotConfigCreate | BotConfig) => void;
  onClose: () => void;
}

/**
 * 
 * @param param0 
 * @returns 
 */
export function BotForm({ bot, onSave, onClose }: BotFormProps) {

  const { register, handleSubmit, control, formState } = useForm<BotConfigCreate>({
      defaultValues: bot,
      resolver: zodResolver(bot?.PK ? BotConfigSchema : BotConfigCreateSchema)
  })

  // resolver already validates, so `values` are typed & validated
  const onSubmit = handleSubmit(async (values) => {
    try {
      await onSave(values);
    } catch (err) {
      console.error(err);
      // if you want to set field errors returned from server:
      // setError("symbol", { type: "server", message: "Symbol already used" })
    }
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">
            {bot?.PK ? "Edit Bot" : "Create New Bot"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        

        <Form control={control} onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Symbol
            </label>
            <input
              type="text"
              {...register('symbol')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="XBTUSDTM"
              required
            />
            <em>{formState.errors.symbol?.message}</em>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Position Side
            </label>
            <select
                {...register('positionSide')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Order Size ($)
              </label>
              <input
                  {...register('equity.size', { min: 10 })}
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                      Base Order Percent (%)
                  </label>
                  <input
                      type="number"
                      {...register('equity.percentage',  { min: 1, max: 100, })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
              </div>

          </div>

            <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Take Profit (%)
            </label>
            <input
              type="number"
              {...register('takeProfit.percentage', { min: 0.1, max: 100 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              step="0.1"
              required
            />
          </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Leverage
                </label>
                <input
                    type="number"
                    {...register('equity.maxLeverage')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="100"
                    required
                />
            </div>
            </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Margin Mode
            </label>
            <select
              {...register('marginMode')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="CROSS">CROSS</option>
              <option value="ISOLATED">ISOLATED</option>
            </select>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Security Order
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Distance (%)
                </label>
                <input
                  type="number"
                  {...register('securityOrder.distancePercentage')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0.1"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Size Multiplier
                </label>
                <input
                  type="number"
                  {...register('securityOrder.sizeMultiplier')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              {...register('enabled')}

              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label
              htmlFor="enabled"
              className="ml-2 block text-sm text-gray-700"
            >
              Enable bot
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Bot
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
