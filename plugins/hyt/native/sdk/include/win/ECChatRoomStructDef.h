#ifndef _EC_CONF_CHATROOM_STRUCT_DEFINE_H
#define _EC_CONF_CHATROOM_STRUCT_DEFINE_H

#include "ECStructDef.h"
typedef enum {

	/** 默认 */
	ECLiveChatRoomNoticeType_None = 0,

	/** 加入聊天室 */
	ECLiveChatRoomNoticeType_Join = 1,

	/** 修改聊天室信息 */
	ECLiveChatRoomNoticeType_ModifyRoomInfo = 2,

	/** 更改成员角色 */
	ECLiveChatRoomNoticeType_SetMemberRole = 3,

	/** 踢出成员 */
	ECLiveChatRoomNoticeType_KickMember = 4,

	/** 退出聊天室 */
	ECLiveChatRoomNoticeType_Eixt = 5,

	/** 聊天室全员禁言 */
	ECLiveChatRoomNoticeType_AllMute = 6,

	/** 聊天室全员取消禁言 */
	ECLiveChatRoomNoticeType_CancelAllMute = 7,

	/** 成员禁言 */
	ECLiveChatRoomNoticeType_MemberMute = 8,

	/** 成员取消禁言 */
	ECLiveChatRoomNoticeType_CancelMemberMute = 9,

	/** 成员拉黑 */
	ECLiveChatRoomNoticeType_MemberBlack = 10,

	/** 成员取消拉黑 */
	ECLiveChatRoomNoticeType_CancelMemberBlack = 11,

	/** 聊天室关闭 */
	ECLiveChatRoomNoticeType_StopLiveChatRoom = 12,

} ECLiveChatRoomNoticeType;

#pragma pack(4)
typedef struct _ECChatRoomEnter
{
	char creator[BUF_LEN_256];//创建者
	char roomNickname[BUF_LEN_128];//房间名称
	char announcement[BUF_LEN_1024];//房间公告
	int onlineCount;//在线人数
	int inAllMuteMode;//静音。1 不是 2 是
	char roomExt[10240];//房间透传字段
	char broadCastUrl[BUF_LEN_4096];//拉流地址
	int type;//用户类型 1 创建者 2 管理员 3 普通用户
	int state;//1.禁言 2.取消禁言 3.拉黑  4.取消拉黑 默认0
	int muteDuration;//禁言时长.单位秒
	char enterTime[BUF_LEN_128];//进入聊天室的时间

	_ECChatRoomEnter()
	{
		memset(this, 0, sizeof(_ECChatRoomEnter));
	}

	_ECChatRoomEnter(const _ECChatRoomEnter& rOther)
	{
		*this = rOther;
	}
}ECChatRoomEnter;

typedef struct _ECChatRoomInfo
{
	char creator[BUF_LEN_256];//创建者
	char roomNickname[BUF_LEN_128];//房间名称
	char announcement[BUF_LEN_1024];//房间公告
	int onlineCount;//在线人数
	int inAllMuteMode;//1 不是 2 是
	char roomExt[10240];//房间透传字段

	_ECChatRoomInfo()
	{
		memset(this, 0, sizeof(_ECChatRoomInfo));
	}

	_ECChatRoomInfo(const _ECChatRoomInfo& rOther)
	{
		*this = rOther;
	}
}ECChatRoomInfo;

typedef struct _ECChatRoomMemberInfo
{
	char userId[BUF_LEN_256];//账号
	char nickname[BUF_LEN_128];//昵称
	int type;//用户类型 1 创建者 2 管理员 3 普通用户
	int state;//1.禁言 2.取消禁言 3.拉黑  4.取消拉黑 默认0
	int muteDuration;//禁言时长。单位：秒
	char enterTime[BUF_LEN_128];//进入聊天室的时间
	char infoExt[10240];//透传字段 json

	_ECChatRoomMemberInfo()
	{
		memset(this, 0, sizeof(_ECChatRoomMemberInfo));
	}

	_ECChatRoomMemberInfo(const _ECChatRoomMemberInfo& rOther)
	{
		*this = rOther;
	}
}ECChatRoomMemberInfo;

typedef struct _ECReceiveNoVersionMessage
{
	char msgContent[BUF_LEN_8192];//文本消息内容
	char msgDateCreated[BUF_LEN_128];//服务器接收消息时间
	char msgDomain[BUF_LEN_4096];//扩展的消息字段
	char msgFileName[BUF_LEN_1024];//文件名
	char msgFileUrl[BUF_LEN_4096];//下载地址
	char msgId[BUF_LEN_128];//消息id
	char msgReceiver[BUF_LEN_256];//接收者
	char msgSender[BUF_LEN_256];//发送者
	char msgSenderNick[BUF_LEN_128];//发送者昵称
	int  msgType;//消息类型,1:文本消息 2：语音消息 3：视频消息  4：图片消息  5：位置消息  6：文件 
	char msgFileSize[BUF_LEN_128];//文件大小
	char extOpts[10240];//服务器业务扩展字段 json字符串
	_ECReceiveNoVersionMessage()
	{
		memset(this, 0, sizeof(_ECReceiveNoVersionMessage));
	}

	_ECReceiveNoVersionMessage(const _ECReceiveNoVersionMessage& rOther)
	{
		*this = rOther;
	}
}ECReceiveNoVersionMessage;

typedef struct _ECLiveChatRoomNoticeMessage
{
	ECLiveChatRoomNoticeType type;//通知类型
	char roomId[BUF_LEN_128];//房间id
	char roomName[BUF_LEN_256];//房间名称
	char msgSender[BUF_LEN_256];//发送者
	char userId[BUF_LEN_256];//账号
	char userName[BUF_LEN_256];//昵称	
	char infoExt[10240];//透传字段 json
	char msgDateCreated[BUF_LEN_128];//服务器接收消息时间
	int  role;//用户类型 1 创建者 2 管理员 3 普通用户

	_ECLiveChatRoomNoticeMessage()
	{
		memset(this, 0, sizeof(_ECLiveChatRoomNoticeMessage));
	}

	_ECLiveChatRoomNoticeMessage(const _ECLiveChatRoomNoticeMessage& rOther)
	{
		*this = rOther;
	}
}ECLiveChatRoomNoticeMessage;
/****************************直播聊天室回调接口******************************/

typedef void(*on_ytx_sendChatRoomMessage)(unsigned int matchKey, int reason);//发送直播聊天室消息回调  reason：200成功，其他报错；
typedef void(*on_ytx_enterChatroom)(unsigned int matchkey, int reason, ECChatRoomEnter* pInfo);//进入直播聊天室回调   reason：200成功，其他报错；
typedef void(*on_ytx_exitChatroom)(unsigned int matchKey, int reason);//退出直播聊天室回调  reason：200成功，其他报错；
typedef void(*on_ytx_fetchChatroomInfo)(unsigned int matchKey, int reason, ECChatRoomInfo* pInfo);//获取直播聊天室信息回调   reason：200成功，其他报错；
typedef void(*on_ytx_fetchChatroomMembers)(unsigned int matchKey, int reason, int count, ECChatRoomMemberInfo* pInfo);//获取直播聊天室成员信息回调   reason：200成功，其他报错；
typedef void(*on_ytx_kickMember)(unsigned int matchKey, int reason);//踢出直播聊天室回调   reason：200成功，其他报错；
typedef void(*on_ytx_updateChatroomInfo)(unsigned int matchKey, int reason);//更新直播聊天室信息回调   reason：200成功，其他报错；
typedef void(*on_ytx_updateChatRoomMemberRole)(unsigned int matchKey, int reason);//更新直播聊天室成员角色回调   reason：200成功，其他报错；
typedef void(*on_ytx_updateMemberOption)(unsigned int matchKey, int reason);//更新直播聊天室成员权限回调(禁言,拉黑) reason：200成功，其他报错；
typedef void(*on_ytx_updateMyChatroomMemberInfo)(unsigned int matchKey, int reason);//更新直播聊天室成员信息回调   reason：200成功，其他报错；
typedef void(*on_ytx_Chatroom_ReceiveNoVersionMessage)(ECReceiveNoVersionMessage* pInfo);//收到的推送消息
typedef void(*on_ytx_Chatroom_ReceiveNoticeMessage)(ECLiveChatRoomNoticeMessage* pInfo);//聊天室状态通知

//回调结构体
typedef struct _ChatRoomCallBackInterface
{
	on_ytx_sendChatRoomMessage pfon_ytx_sendChatRoomMessage;
	on_ytx_enterChatroom pfon_ytx_enterChatroom;
	on_ytx_exitChatroom pfon_ytx_exitChatroom;
	on_ytx_fetchChatroomInfo pfon_ytx_fetchChatroomInfo;
	on_ytx_fetchChatroomMembers pfon_ytx_fetchChatroomMembers;
	on_ytx_kickMember pfon_ytx_kickMember;
	on_ytx_updateChatroomInfo pfon_ytx_updateChatroomInfo;
	on_ytx_updateChatRoomMemberRole pfon_ytx_updateChatRoomMemberRole;
	on_ytx_updateMemberOption pfon_ytx_updateMemberOption;
	on_ytx_updateMyChatroomMemberInfo pfon_ytx_updateMyChatroomMemberInfo;
	on_ytx_Chatroom_ReceiveNoVersionMessage pfon_ytx_Chatroom_ReceiveNoVersionMessage;
	on_ytx_Chatroom_ReceiveNoticeMessage    pfon_ytx_Chatroom_ReceiveNoticeMessage;
	_ChatRoomCallBackInterface() :
		pfon_ytx_sendChatRoomMessage(NULL), pfon_ytx_enterChatroom(NULL), pfon_ytx_exitChatroom(NULL)
		, pfon_ytx_fetchChatroomInfo(NULL), pfon_ytx_fetchChatroomMembers(NULL), pfon_ytx_kickMember(NULL), pfon_ytx_updateChatroomInfo(NULL)
		, pfon_ytx_updateChatRoomMemberRole(NULL), pfon_ytx_updateMemberOption(NULL), pfon_ytx_updateMyChatroomMemberInfo(NULL)
		, pfon_ytx_Chatroom_ReceiveNoVersionMessage(NULL), pfon_ytx_Chatroom_ReceiveNoticeMessage(NULL)
	{

	}

}ECChatRoomCallBackInterface;

#pragma pack ()

#endif//_EC_CONF_MEETING_STRUCT_DEFINE_H