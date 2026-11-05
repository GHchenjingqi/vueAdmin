import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import {
  addressIdParamSchema,
  createAddressSchema,
  updateAddressSchema,
} from '../../../shared/schemas/customer.js'
import * as addressController from '../controllers/addressController.js'
import { customerAuth } from '../middleware/customerAuth.js'

/**
 * P4-T02 地址簿（需顾客登录，挂载于 /api/storefront/v1/addresses）
 *   GET    /                 我的地址列表（默认在前）
 *   POST   /                 新增地址（首条自动默认）
 *   PATCH  /:id              编辑地址（非本人 → 404）
 *   DELETE /:id              删除地址（删默认自动提升）
 *   POST   /:id/default      设为默认（唯一）
 */
const router = Router()

router.get('/', customerAuth, addressController.listAddresses)
router.post('/', customerAuth, validate(createAddressSchema, 'body'), addressController.createAddress)
router.patch('/:id', customerAuth, validate(addressIdParamSchema, 'params'), validate(updateAddressSchema, 'body'), addressController.updateAddress)
router.delete('/:id', customerAuth, validate(addressIdParamSchema, 'params'), addressController.deleteAddress)
router.post('/:id/default', customerAuth, validate(addressIdParamSchema, 'params'), addressController.setDefaultAddress)

export default router
