#ifndef _EC_CHATROOM_INTERFACE_H
#define _EC_CHATROOM_INTERFACE_H

#include "ECChatRoomStructDef.h"
#ifdef __cplusplus
extern "C"
{
#endif

	//////////////////////////////////////////////////回调函数接口///////////////////////////////////////////////////////////
	//回调设置接口，必须在主调前调用
	EC_CALL_API void SetChatRoomCallBackFuction(ECChatRoomCallBackInterface *chatRoomInterface);


	//////////////////////////////////////////////////主调函数接口///////////////////////////////////////////////////////////

	/*! @function
	********************************************************************************
	函数名: ytx_SendChatRoomMessage
	功能  : 发送直播聊天室的消息
	参数     :  [IN]  matchKey     : 回传流水号
				[IN]  type		   : 消息类型 1:文本消息 2：语音消息 3：视频消息  4：图片消息  5：位置消息
									6：文件（压缩方式） 7: 文件（非压缩方式）8: 纯链接消息 9:群组通知消息 10: 未接来电消息
									11:@功能 文本消息 12:用户自定义消息透传  13:打洞前收集内外网映射地址消息，透传
									20：协同服务器透传使用 21：发送即焚消息通知 22：匿名模式开关通知 24:消息已读通知
									25:消息撤回通知 30:SDK透传json消息(现恒丰朋友圈使用)
				[IN]  message      : 文本消息内容
				[IN]  receiver     : 接收者用户名			
				[IN]  userdata     : 需要扩展的消息字段放在这里
				[IN]  isAnonymity  : 是否匿名聊天
				[IN]  extOpts      : 服务器业务扩展字段 json字符串

	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_sendChatRoomMessage)(unsigned int tcpMsgIdOut, int reason)
	*******************************************************************************/
	EC_CALL_API int ytx_SendChatRoomMessage(unsigned int* matchKey, int type, const char* message, const char* receiver, const char* userdata, bool isAnonymity, const char* extOpts);

	/*! @function
	********************************************************************************
	函数名: ytx_EnterChatroom
	功能  : 进入直播聊天室
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomId          : 房间号
			[IN]  nickName        : 用户显示昵称
			[IN]  infoExt         : 用户扩展字段
			[IN]  notifyExt       : 通知扩展字段
			[IN]  needNotify      : 是否需要通知, 1 不通知 2 通知 (默认2)
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_enterChatroom)
	*******************************************************************************/
	EC_CALL_API int ytx_EnterChatroom(unsigned int* matchKey, const char* roomId, const char* nickName, const char* infoExt, const char* notifyExt, int needNotify);

	/*! @function
	********************************************************************************
	函数名: ytx_ExitChatroom
	功能  : 退出直播聊天室
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomid          : 房间号
			[IN]  notifyExt       : 通知扩展字段
			[IN]  needNotify      : 是否需要通知, 1 不通知 2 通知 (默认2)
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_exitChatroom)
	*******************************************************************************/
	EC_CALL_API int ytx_ExitChatroom(unsigned int* matchKey, const char* roomId, const char* notifyExt, int needNotify);


	/*! @function
	********************************************************************************
	函数名: ytx_FetchChatroomInfo
	功能  : 查询直播聊天室房间信息
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomId          : 房间号
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_fetchChatroomInfo)
	*******************************************************************************/
	EC_CALL_API int ytx_FetchChatroomInfo(unsigned int* matchKey, const char* roomId);

	/*! @function
	********************************************************************************
	函数名: ytx_FetchChatroomMembers
	功能  :查询聊天室成员
	参数  : [IN]  matchkey        : 流水号
			[IN]  roomId          : 房间号
			[IN]  userId          : 用户id
			[IN]  type            :  1 获取列表  2 获取单个成员
			[IN]  pageSize        : 页数
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_fetchChatroomMembers)
	*******************************************************************************/
	EC_CALL_API int ytx_FetchChatroomMembers(unsigned int* matchKey, const char* roomid, const char* userId, int type, int pageSize);

	/*! @function
	********************************************************************************
	函数名: ytx_KickMember
	功能  : 踢出直播聊天室
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomId          : 房间号
			[IN]  userId          : 用户id
			[IN]  notifyExt       : 通知扩展字段
			[IN]  needNotify      : 是否需要通知, 1 不通知 2 通知 (默认2)
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_kickMember)
	*******************************************************************************/
	EC_CALL_API int ytx_KickMember(unsigned int* matchKey, const char* roomId, const char* userId, const char* notifyExt, int needNotify);

	/*! @function
	********************************************************************************
	函数名: ytx_UpdateChatroomInfo
	功能  : 更新直播聊天室的信息
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomId          : 房间号
			[IN]  roomName        : 房间名称
			[IN]  announcement    : 房间公告
			[IN]  roomExt         : 房间扩展字段
			[IN]  allMuteMode     ：是否全员禁言。 1 不是 2 是
			[IN]  notifyExt       : 通知扩展字段
			[IN]  needNotify      : 是否需要通知, 1 不通知 2 通知 (默认2)
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_updateChatroomInfo)
	*******************************************************************************/
	EC_CALL_API int ytx_UpdateChatroomInfo(unsigned int* matchKey, const char* roomId, const char* roomName, const char* announcement, const char* roomExt, int allMuteMode, const char* notifyExt, int needNotify);

	/*! @function
	********************************************************************************
	函数名: ytx_UpdateChatRoomMemberRole
	功能  : 更新直播聊天室成员角色
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomid          : 房间号
			[IN]  userid          : 用户id
			[IN]  type            : 用户类型 1 创建者 2 管理员 3 普通用户(暂时不传)
			[IN]  notifyExt       : 通知扩展字段
			[IN]  needNotify      : 是否需要通知, 1 不通知 2 通知 (默认2)
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_updateChatRoomMemberRole)
	*******************************************************************************/
	EC_CALL_API int ytx_UpdateChatRoomMemberRole(unsigned int* matchKey, const char* roomId, const char* userid, int type, const char* notifyExt, int needNotify);

	/*! @function
	********************************************************************************
	函数名: ytx_UpdateMemberOption
	功能  : 更新直播聊天室成员权限
	参数  : [IN]  matchKey        : 流水号
			[IN]  roomid          : 房间号
			[IN]  userid          : 用户id
			[IN]  state           : 1.禁言 2.取消禁言 3.拉黑  4.取消拉黑 默认0
			[IN]  muteDuration    : 禁言时长.单位：秒 
			[IN]  notifyExt       : 通知扩展字段
			[IN]  needNotify      : 是否需要通知, 1 不通知 2 通知 (默认2)
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_updateMemberOption)
	*******************************************************************************/
	EC_CALL_API int ytx_UpdateMemberOption(unsigned int* matchKey, const char* roomId, const char* userid, int state, int muteDuration, const char* notifyExt, int needNotify);

	/*! @function
	********************************************************************************
	函数名: ytx_UpdateMyChatroomMemberInfo
	功能  : 更新直播聊天室成员信息
	参数  : [IN]  matchkey        : 流水号
			[IN]  roomid          : 房间号
			[IN]  nickName        : 用户显示昵称
			[IN]  infoExt         : 用户扩展字段
	返回值   : 0成功； 非0失败
	回调函数 ：void (*on_ytx_updateMyChatroomMemberInfo)
	*******************************************************************************/
	EC_CALL_API int ytx_UpdateMyChatroomMemberInfo(unsigned int* matchKey, const char* roomId, const char* nickName, const char* infoExt);

#ifdef __cplusplus
}
#endif

#endif