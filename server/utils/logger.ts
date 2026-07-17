/**
 * 日志记录工具
 * @module logger
 */

import Log from '../models/Log.js'

/**
 * 记录登录成功日志
 * @param {import('../models/User.js')} user - 用户实例
 * @param {import('express').Request} req - 请求对象
 */
export const logLogin = async (user, req) => {
  try {
    await Log.create({
      type: 'login',
      userId: user.id,
      username: user.username,
      action: '用户登录',
      details: '登录成功',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })
  } catch (err) {
    console.error('记录登录日志失败:', err.message)
  }
}

/**
 * 记录登录失败日志
 * @param {string} username - 用户名
 * @param {string} reason - 失败原因
 * @param {import('express').Request} req - 请求对象
 */
export const logLoginFailure = async (username, reason, req) => {
  try {
    await Log.create({
      type: 'login',
      username: username || '未知',
      action: '登录失败',
      details: reason || '密码错误',
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    })
  } catch (err) {
    console.error('记录登录失败日志失败:', err.message)
  }
}

/**
 * 记录操作日志
 * @param {import('express').Request} req - 请求对象
 * @param {string} action - 操作动作描述
 * @param {string} target - 操作对象描述
 * @param {string} [details] - 详细变更内容（JSON 字符串）
 */
export const logOperation = async (req, action, target, details?) => {
  try {
    await Log.create({
      type: 'operation',
      userId: req.user?.id,
      username: req.user?.username,
      action,
      target,
      details,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })
  } catch (err) {
    console.error('记录操作日志失败:', err.message)
  }
}