#ifndef _EC_CONF_MEETING_STRUCT_DEFINE_H
#define _EC_CONF_MEETING_STRUCT_DEFINE_H

#include "ECStructDef.h"

typedef enum
{
	ConfMsgType_None= -1,
	ConfMsgType_CreateConf = 0, // 0会议创建
	ConfMsgType_DeleteConf=1, // 1删除会议
	ConfMsgType_MemberJoin=2, // 2用户加入会议
	ConfMsgType_MemberQuit=3, // 3用户退出会议
	ConfMsgType_KickMember=4, // 4踢出成员
	ConfMsgType_UpdateMemberInfo=5, //5 更新成员信息
	ConfMsgType_InviteMember=6, // 6 会议邀请的通知
	ConfMsgType_InviteResult=7, // 7 邀请结果
	ConfMsgType_CancelInvite = 12,//12 成员加入会议后，取消此成员其他终端的呼叫邀请 页面
	ConfMsgType_StartingConfSummaryTask = 13,//13开始会议纪要转换任务的通知
	ConfMsgType_CompletedConfSummaryTask = 14,//14完成会议纪要转换任务的通知
	ConfMsgType_PostStartingConf = 15,//15目前未启用 会议已经开始，仅发送到 app 订阅通知，可用于开始会议后执行一些业务处理
	ConfMsgType_UpdateConf = 17, // 17更新会议
	ConfMsgType_PlayOver=18, // TODO 文档
	ConfMsgType_SendCommand=19, // 19 透传接口（举手）发送数据传输通知
	ConfMsgType_SsSource = 21, //21 屏幕共享的源ip和端口
	ConfMsgType_MediaControl = 22, //22媒体控制
	ConfMsgType_RecordOver=23, // 23 TODO 文档
	ConfMsgType_ReserveNote=24, // 24 会议预约的通知
	ConfMsgType_ReserveRemindBeforeStart=25, // 25 会议开始前的提醒通知
	ConfMsgType_ReserveRemindBeforeEnd=26, // 26 会议结束前的通知
	ConfMsgType_ConfAppServerNote = 31, //31 会议App的通知
	ConfMsgType_Interpretation = 40, //40 会议同传通知
	ConfMsgType_EndCaveat = 43, //会议结束前180秒倒计时通知(自动延时不通知)
	ConfMsgType_ConfRoom = 44, //会议室通知

	ConfMsgType_Total
}ECConfMsgType;//会议通知

typedef enum
{
	UserStateOffline = 0x000000,								//0 离线，邀请入会的成员，其状态初值为0
	UserStateAppOnline = 0x000001,								//1 应用在线（调用 用户加入会议 接口）后，此位置1
	UserStateSpeaking = 0x000002,								//2 正在说话
	UserStateCameraSharing = 0x000004,							//4 正在共享自己的摄像头（视频会议），此位置1
	UserStateScreenSharing = 0x000008,							//8 正在共享自己的屏幕，此位置1

	UserStateWbSharing = 0x000010,								//16 在白板房间中
	UserStateWaiteRemove = 0x000020,							//32 内部使用 wait remove
	UserStateUnMute = 0x000040,									//64 可讲 （打开麦克风）时，此位置1
	UserStateAllowListen = 0x000080,							//128 可听（取消静音）时，此位置1

	// 用户 媒体在线、拒绝邀请、正在接通、已挂断  四种状态互斥，同一时刻，只会有一个状态为是1
	UserStateMediaOnline = 0x000100,							//256 媒体在线（sip呼叫接通）时，此位置1
	UserStateRejectInvite = 0x000200,							//512 用户拒绝邀请（挂断电话 或 调用 拒绝会议邀请 接口）时，此位置1
	UserStateBeCalling = 0x000400,								//1024 正在接通（调用 邀请加入会议 接口）时，此位置1；
	UserStateHangup = 0x000800,									//2048 已挂断（sip呼叫断开）时，此位置1；

	// 媒体在线 置1时， 接受邀请 肯定会置1； 接受邀请 置1时， 媒体在线 可能是0
	// 拒绝邀请 和 接受邀请 两种状态互斥 （拒绝邀请 置1时， 接受邀请 肯定会置0；  接受邀请 置1时， 拒绝邀请 肯定会置0）
	UserStateAcceptInvite = 0x001000,							//4096 用户接受邀请（接听电话 或 调用 接受会议邀请 接口）时，此位置1
	UserStateMediaPhoneOn = 0x002000,							//用户使用落地电话接入的媒体
	UserStateCallOut = 0x004000,								//外呼参会成员 (用于计费时，区分 呼入 和 外呼 的情况， 外呼成员需要单独扣费)
	UserStateRecording = 0x008000,								//正在录制

	// --------有序发言模式 点名、申请发言 状态---------
	UserStateRoleLimitVoiceToAttendeeByModerator = 0x00010000,	//会议受限成员，置1表示 主持点名申请将其变更为发言人
	UserStateRoleLimitVoiceToAttendeeBySelf = 0x00020000,		//会议受限成员，置1表示 自己举手申请变更为发言人

	UserStateMediaTimeout = 0x00040000,							//媒体超时（因网络原因长时间未收到客户端媒体流）时，此位置1；
	UserStateInviteTimeout = 0x00080000							//呼叫超时

}ECUserState;

typedef enum
{
	ControlNone = -1,						//所有属性
	ControlForbidListen = 0,				//禁听
	ControlAllowSListen = 1,				//可听
	ControlForbidSpeak = 2,					//禁言
	ControlAllowSpeak = 3,					//可讲
	ControlVoiceTotal,

	ControlForbidWatchCamera = 10,			//取消观看视频
	ControlAllowSWatchCamera = 11,			//观看视频
	ControlForbidShareCamera = 12,			//取消发布视频
	ControlAllowShareCamera = 13,			//发布视频
	ControlCameraTotal,

	ControlForbidWatchScreen = 20,			//取消观看共享
	ControlAllowSWatchScreen = 21,			//观看共享
	ControlForbidShareScreen = 22,			//取消发布桌面共享
	ControlAllowShareScreen = 23,			//发布桌面共享
	ControlScreenTotal,

	ControlForbidWatchWhiteboard = 30,		//取消观看白板
	ControlAllowSWatchWhiteboard = 31,		//观看白板
	ControlForbidShareWhiteboard = 32,		//取消共享白板
	ControlAllowShareWhiteboard = 33,		//共享白板
	ControlForbidOperateWhiteboard = 34,	//取消操作白板
	ControlAllowOperateWhiteboard = 35,		//操作白板
	ControlWhiteboardTotal,

	ControlStartSpeaking = 40,				//开始说话
	ControlStopSpeaking = 41,				//停止说话
	ControlSpeakingTotal,

	ControlSetRole = 50,					//成员角色改变时，发出此通知，如调用 设置会议成员角色
	ControlUserInfo = 51,					//成员的 state/username/appdata 等数据改变时，发出此通知，如调用 更新会议成员信息 或 成员媒体断开 
	ControlSetRoleTotal = 52,				//会议信息更新
	ControlConfLockUnlock = 53,				//会议锁定状态更新
	ControlConfTopic = 54,					//会议议题更新
	ControlConfStartTime = 55,				//会议开始时间更新
	ControlUserRejectInvitation = 56,		//拒绝会议邀请
	ControlUserAcceptInvitation = 57,		//接受会议邀请
	ControlConfEndTime = 58,				//会议结束时间更新，时长 会议室改变

	ControlDelConfByUser = 60,						//用户主动解散会议
	ControlDelConfByIdleConf = 61,					//会议空闲， 解散
	ControlDelConfByExceedLimit = 62,				//会议超出最大时长限制， 解散
	ControlDelConfByConflictInConfRoomError = 63,	//会议室繁忙， 内部异常 导致 无法延时
	ControlDelConfByConflictInConfRoomPrivate = 64,	//会议室繁忙，有会议占用会议室， 必须解散冲突的预约会议 （私人会议室）
	ControlDelConfByConflictInConfRoomOrgPub = 65,	//会议室繁忙，有预约会议占用会议室，无法延长当前会议时长 （企业会议室）
	ControlMultiMediaRemove = 66,					//启用多终端参会后， 成员真正入会后，会移除不带 @DeviceType 的成员信息
	ControlMemberQuit = 67,							//成员主动退出会议
	ControlDelConfByConflictInConfRoomDevice = 68,	//会议室繁忙， 预约会议到达预约时间 （企业硬件会议室）
	ControlConfLiveStart = 69,						//开始会议直播
	ControlConfLiveStop = 70,						//停止会议直播
	ControlConfLiveSwitch = 71,						//会议成员直播切换
	ControlConfLiveGetPlayUrl = 72,					//获取会议直播播放地址
	ControlDelConfByConfRoomDelete = 73,			//会议室被删除
	ControlDelConfByConfRoomDisable = 74,			//会议室被禁用
	ControlConfFileChanged = 75,					//会议文件库变化
	ControlConfAbstractChanged = 76,				//会议摘要变化
	ControlApplyPublishVoiceByModerator = 77,		//主持人点名
	ControlAcceptPublishVoiceByModerator = 78,		//主持人同意申请发言
	ControlRejectPublishVoiceByModerator = 79,		//主持人 拒绝 申请发言
	ControlStopPublishVoiceByModerator = 80,		//主持人 取消发言人权限，即更改发言人角色为 普通成员
	ControlApplyPublishVoiceBySelf = 81,			//参会人 申请发言
	ControlAcceptPublishVoiceBySelf = 82,			//参会人 同意点名
	ControlRejectPublishVoiceBySelf = 83,			//参会人 拒绝点名
	ControlStopPublishVoiceBySelf = 84,				//参会人 取消发言
	ControlRequestKeyFrame = 85,					//请求关键帧
	ControlDelConfBySyncFromPolycomDMA = 86,		//PolycomDMA 同步到被删除的会议
	ControlSetMixScreenMembers = 87,				//设置混合显示成员列表
	ControlConfSwitchOnScreenLive = 88,				//开始会议屏幕直播
	ControlConfSwitchOffScreenLive = 89,			//停止会议屏幕直播
	ControlConfSetVideoLayout = 91,					//设置视频画面显示 固定布局 ， 目前主要用于 Polycom MCU
    ControlSetConfLayout = 92,						//会议布局 add by keven.
	
	ControlInviteByStartConf = 100,					//“到达会议预约时间，先邀请主持人” 产生的 NotifyInviteMember
	ControlInviteByStartingConf = 101,				//“自动开始会议” 产生的 NotifyInviteMember
	ControlInviteByConfMember = 102,				//“会中成员手动邀请” 产生的 NotifyInviteMember
	ControlConfRecordStart = 111,					//开始会议录制
	ControlConfRecordStop = 112,					//停止会议录制
	ControlConfRecordSwitch = 113,					//会议成员录制切换
	ControlConfRecordGetFileList = 114,				//获取会议录制信息
	ControlConfRecordSwitchOnScreen = 115,			//切换到录制会议屏幕共享
	ControlConfRecordSwitchOffScreen = 116,			//停止录制会议屏幕共享
	ControlConfRecordGetSessions = 117,				//获取录制会话
	ControlConfRecordDeleteFile = 118,				//删除录制文件
	ControlConfLiveGetSessions = 120,				//获取直播会话
	ControlMemberDisconnect = 121,					//断开媒体
	ControlConfRecordPause = 122,					//暂停会议录制
	ControlConfRecordResume = 123,					//恢复会议录制
	ControlCdrQuery = 124,							//转发到CDR(通过callroute)
	ControlConfLiveSchedule = 130,					//Schedule a live session along with scheduling a conference
	ControlConfLiveDelete = 131,					//删除会议屏幕直播
	ControlVcsCiscoLiveStart = 140,					//请求cisco直播
	ControlVcsCiscoLiveStop = 141,
	ControlVcsAwayaLiveStart = 142,					//请求awaya直播
	ControlVcsAwayaLiveStop = 143,
	ControlVcsHuaweiLiveStart = 144,				//请求Huawei直播
	ControlVcsHuaweiLiveStop = 145,
	ControlVcsSipLiveStart = 146,					//请求三方sip直播
	ControlVcsSipLiveStop = 147,
	ControlVcsRequestLiveUrl = 148,					//请求获取直播推拉流地址
	ControlVcsPolycomLiveStart = 149,				//请求Polycom直播
	ControlVcsPolycomLiveStop = 150,

	ControlInviteTimeout = 153,						//会议邀请超时
	ControlConfSubTitle = 155,						//会议字幕更新
	ControlConfTurnType = 156,						//会议轮巡更新
	ControlConfAheadRemind = 157,					//会议开始前提醒通知
	ControlConfRoomBookUpdate = 158,				//会议室预定更新通知
	ControlConfRoomBookDelete = 159,				//会议室约定取消通知
	ControlConfRoomForbid = 160,					//会议室禁用通知
	ControlConfRoomBook = 161,						//会议室预订通知

}ECControlAction;

typedef enum
{//会议申请视频资源回调原因值
	EC_Conference_status_RequestTimeout = -1,//请求超时
	EC_Conference_status_OK = 0,//请求成功，上报上层，这里自动设置视频窗口
	EC_Conference_status_NotExist,//会议不存在
	EC_Conference_status_UserExclusive,//自己不在会议中
	EC_Conference_status_RequestedUserExclusive,//请求目标不在会议中
	EC_Conference_status_RequestedUserNoVideo//请求目标没有视频
} ECConference_status;

typedef enum {//会议状态.
	ConfState_free = 0x000000,					//0: 空闲.
	ConfState_employ = 0x000001,				//1: 占用 历史记录中：为0，会议未开始就被取消；为1，会议开始过，现已结束.
	ConfState_lock = 0x000002,					//2: 已经锁定（此时禁止 成员加入）.
	ConfState_LockShareWhiteboard = 0x0004,		//4: 已经锁定（此时禁止 发起白板操作）.
	ConfState_LockOperateWhiteboard = 0x0008,	//8 : 已经锁定（此时禁止 白板标注.
	ConfState_ShareWhiteboard = 0x0010,			//16 : 正在共享白板.
	ConfState_ShareScreen = 0x0020,				//32 : 正在共享屏幕.
	ConfState_Recording = 0x0040,				//64 : 正在录制中.
	ConfState_Living = 0x0080,					//128 : 正在直播中.
	ConfState_LockApplyPublishVoice = 0x0100,	//256 : 已经锁定发言（此时禁止 RoleAttendeeLimit = 10 成员申请发布语音）.

}ECConfState;

#pragma pack (4)

//成员顺呼信息
typedef struct _ECConfMembersCalledSort
{
	char callMemberId[BUF_LEN_256];	//呼叫成员ID.
	int callType;					//类型 1: 落地电话号码，2: 应用账号.
}ECConfMembersCalledSort;

typedef struct _ECConfMembersContainRoleId
{
	char memberId[BUF_LEN_256];//成员id
	int idType;//id类型 1: 落地电话号码，2: 应用账号
	int roleId;//角色id。 0， 1. 创建者，2. 主持人，3.普通成员
	char userName[BUF_LEN_256];//成员名称
	char phoneNumber[BUF_LEN_256];//关联电话，idType为应用账号时，才能有此字段。此时用户使用关联的电话参与会议
	int calledSortCount; //成员顺呼信息数量.
	ECConfMembersCalledSort *calledSort;//顺呼信息表（有值则按列表呼叫，否则使用memberId）.

	_ECConfMembersContainRoleId()
	{
		memset(this,0,sizeof(_ECConfMembersContainRoleId));
	}

	_ECConfMembersContainRoleId(const _ECConfMembersContainRoleId& rOther)
	{
		*this = rOther;
	}
}ECConfMembersContainRoleId;

typedef struct _ECConfMembers
{
	char memberId[BUF_LEN_256];//成员id
	int idType;//id类型 1: 落地电话号码，2: 应用账号
	int deviceType;

	_ECConfMembers()
	{
		memset(this,0,sizeof(_ECConfMembers));
	}

	_ECConfMembers(const _ECConfMembers& rOther)
	{
		*this = rOther;
	}
}ECConfMembers;

typedef struct _ECConferenceMemberInfo
{
	char memberId[BUF_LEN_256];//成员id
	char userName[BUF_LEN_256];//成员名称
	int idType;//成员id类型  1: 落地电话号码，2: 应用账号
	int roleId;//角色id。0， 1. 创建者，2. 主持人，3.普通成员
	int memberState;//成员当前状态。详见ECUserState
	int joinState;//成员加入状态。 详见ECUserState
	char joinTime[BUF_LEN_64];//加入时间
	char leaveTime[BUF_LEN_64];//离开时间
	char updateTime[BUF_LEN_64];//更新时间
	char phoneNumber[BUF_LEN_256];//关联电话，idType为应用账号时，才能有此字段。此时用户使用关联的电话参与会议
	char inviteResult[BUF_LEN_33];//邀请结果，当用户拒绝邀请时，此字段说明具体原因
	char terminalUA[BUF_LEN_256];//终端类型
	char appData[1024];//扩展,如果应用设置了成员的自定义属性，则返回这个字段
	char videoSsrc[BUF_LEN_33];//视频ssrc
	char ssSsrc[BUF_LEN_33];//共享ssrc
	int deviceType; //终端类型（主动获取回调有此字段）服务端定义 1: Android Phone 2: iPhone  10: iPad  11: Android Pad  20: PC  (Just Allowed phone 2 PC(Pad) login)  21:PCweb   22:Mac 30: 安卓电话  31:安卓电视  32：安卓盒子 51：微信app
	int version; // 成员版本号，区分是否三方成员
    //乡村振兴
    char myLayoutIdx[BUF_LEN_64]; //"-1"： 自动  ，"0" ： 首个大屏  ，"DEFAULT"：缺省布局，"NULL"：没有终端特定布局，"1_1" ：一大带一小，"1_3"：一大带三小  ，"1_5"：一大带五小。具体见会议接口文档
    char myMainVenue[BUF_LEN_64]; //主会场的memberID （userID@deviceType）
    char myLayoutPos[1024]; //布局json字符串，具体意义看会议接口文档

	_ECConferenceMemberInfo()
	{
		memset(this,0,sizeof(_ECConferenceMemberInfo));
	}

	_ECConferenceMemberInfo(const _ECConferenceMemberInfo& rOther)
	{
		*this = rOther;
	}
}ECConferenceMemberInfo;

typedef struct _ECConfInfoRoomInfo {
	char cityName[BUF_LEN_256];//城市.
	char buildingName[BUF_LEN_256];//建筑.
	char floorName[BUF_LEN_256];//楼层.
	char confRoomName[BUF_LEN_256];//会议室名称.
	int bookId;//会议室预定ID.

	_ECConfInfoRoomInfo()
	{
		memset(this, 0, sizeof(_ECConfInfoRoomInfo));
	}

	_ECConfInfoRoomInfo(const _ECConfInfoRoomInfo& rOther)
	{
		*this = rOther;
	}

}ECConfInfoRoomInfo;

typedef struct _ECConfInfo
{
	char confId[BUF_LEN_256];//会议id
	char confName[BUF_LEN_256];//会议名称
	int confType;//会议类型  0：临时会议；1：永久会议。
	char creator[BUF_LEN_128];//创建者
	int state;//会议状态。详见ECConfState 
	char password[BUF_LEN_128];//会议密码
	char ownerPassword[BUF_LEN_128];//个人密码
	int maxMember;//最大成员数
	int memberCount;//当前成员个数
	int mediaType;//媒体类型  0:落地电话会议 1:多路视频会议 2:混屏视频会议 3:多路+混屏视频会议
	char startTime[BUF_LEN_64];//开始时间
	int duration;//会议持续时间.单位：分钟
	char appData[1024];//应用扩展字段
	char createTime[BUF_LEN_64];//创建时间
	char updateTime[BUF_LEN_64];//更新时间
	char endTime[BUF_LEN_64]; // 会议结束时间
	int voiceMode;//背景音  0没有提示音只有背景音、1有加入退出提示音及背景音、2无提示音无背景音、3有提示音无背景音
	int autoClose;//主持人离开会议后，会议是否自动结束   0:否，1：是
	int reserveEnable;//是否启用预约功能 0:不启用，1：启用
	int sendInvitation;//预约会议到时间后是否自动发送邀请 0：否，1：是
	int remindBeforeStart;//会议开始前多久发送通知.单位：分钟.
	int remindBeforeEnd;//会议结束前多久发送通知.单位：分钟.
	char moderator[BUF_LEN_128];//指定会议主持人ID
	int count;//预览会议成员个数
	ECConferenceMemberInfo* members;//预览会议成员 最多支持5人
	int sendReserveNote;//启用预约的会议中使用这个字段，是否给会议成员发送提醒通知（提醒成员被列入预约会议成员）0：否，1：是 默认值 0
	char reserveStartTime[BUF_LEN_64];// 会议预约的开始时间
	int joinState; // 加入会议状态(是否打开语音或视频)。详见ECUserState
	char confTopic[BUF_LEN_1024];// 会议主题
	int deviceType;
	char wbInfo[BUF_LEN_1024];//白板信息
	int maxPublishVoiceMember; // 标识最大发言人数
	char confRoomId[BUF_LEN_128]; // 会议室id
	int confRoomType;
	char chatGroupId[BUF_LEN_64]; // 群组id
	int joinConfDefaultState; // 加入的会议默认的状态，由服务器决定
    
    //乡村振兴
    char callid[BUF_LEN_64]; //呼叫id
    char LayoutIdx[BUF_LEN_64]; //"-1"： 自动  ，"0" ： 首个大屏  ，"DEFAULT"：缺省布局，"NULL"：没有终端特定布局，"1_1" ：一大带一小，"1_3"：一大带三小  ，"1_5"：一大带五小。具体见会议接口文档
    char mainVenue[BUF_LEN_64]; //主会场的memberID （userID@deviceType）
    char LayoutPos[1024]; //布局json字符串，具体意义看会议接口文档
	char lastLeaveTime[BUF_LEN_64];//上次退出时间.
	char subtitle[BUF_LEN_1024];//字幕信息 {"method":0,"size":"40px","color":"red","location":1,"text":""}
	char turnType[BUF_LEN_256];//广播轮询 "1_3"

	int confRoomInfoCount;
	ECConfInfoRoomInfo *confRoomInfos;//会议室信息.
	char bookIds[BUF_LEN_1024];//会议室预定ID列表,如 {"bookIds":[1,2,3,5]}.
	char comment[BUF_LEN_4096];//会议内容.
	char place[BUF_LEN_1024];//会议地点.
	char shareUrl[BUF_LEN_1024];//会议分享链接.

	_ECConfInfo()
	{
		memset(this,0,sizeof(_ECConfInfo));
	}

	_ECConfInfo(const _ECConfInfo& rOther)
	{
		*this = rOther;
	}
}ECConfInfo;

typedef struct _ECConfRoomOccupies
{
	char confId[BUF_LEN_64];//会议ID.
	char vStartTime[BUF_LEN_64];//开始时间.
	char vEndTime[BUF_LEN_64];//结束时间.

	char bookUserId[BUF_LEN_64];//预定用户ID.
	char bookUserName[BUF_LEN_256];//预定用户名.
	char bookTopic[BUF_LEN_256];//预定主题.
	char bookType[BUF_LEN_256];//预定会议室类型.
	char bookUserPhone[BUF_LEN_256];//预定用户手机号.
	int disable;// 表示状态，0 - 启用，1 - 禁用.

	_ECConfRoomOccupies()
	{
		memset(this, 0, sizeof(_ECConfRoomOccupies));
	}

	_ECConfRoomOccupies(const _ECConfRoomOccupies& rOther)
	{
		*this = rOther;
	}
} ECConfRoomOccupies;

typedef struct _ECConfRoomDevice
{
	char deviceSncode[BUF_LEN_256];//硬件SN码.
	char deviceName[BUF_LEN_256];//硬件名称.
	char deviceType[BUF_LEN_256];//硬件类型.

	_ECConfRoomDevice()
	{
		memset(this, 0, sizeof(_ECConfRoomDevice));
	}

	_ECConfRoomDevice(const _ECConfRoomDevice& rOther)
	{
		*this = rOther;
	}
} ECConfRoomDevice;

typedef struct _ECConfRoomInfo
{
	char confRoomId[BUF_LEN_64];//会议室ID.
	char memberId[BUF_LEN_64];//成员ID.
	int idType;//成员ID类型.
	int jsonState;//状态.
	char confRoomName[BUF_LEN_256];//会议室名称.
	char confRoomDesc[BUF_LEN_1024];//会议室描述.
	int maxMember;//最大成员数.
	int maxDuration;
	int allowCallOut;
	int confRoomType;//会议室类型.
	char appData[BUF_LEN_256];
	char** telNum;//多余，不使用.
	int occupiesCount;
	ECConfRoomOccupies *occupies;//会议室使用信息.
	char baseDevice[BUF_LEN_1024];//基础设施信息.如电视,视频会议设备,白板,投影仪等.
	int deviceCount;
	ECConfRoomDevice *devices;//会议室设备列表

	_ECConfRoomInfo()
	{
		memset(this, 0, sizeof(_ECConfRoomInfo));
	}

	_ECConfRoomInfo(const _ECConfRoomInfo& rOther)
	{
		*this = rOther;
	}
}ECConfRoomInfo;

typedef struct _ECConfSummary
{
	char confId[BUF_LEN_64];
	char memberId[BUF_LEN_64];
	int idType;
	char confSummaryId[BUF_LEN_64];
	char summaryText[BUF_LEN_4096];
	char startTimestamp[BUF_LEN_64];
	char endTimestamp[BUF_LEN_64];


	_ECConfSummary()
	{
		memset(this, 0, sizeof(_ECConfSummary));
	}

	_ECConfSummary(const _ECConfSummary& rOther)
	{
		*this = rOther;
	}
} ECConfSummary;

typedef struct _ECFaildConferenceMemberInfo
{
	char memberId[BUF_LEN_256];//成员id
	int idType;//成员id类型  1: 落地电话号码，2: 应用账号
	char cause[BUF_LEN_33]; //失败原因

	_ECFaildConferenceMemberInfo()
	{
		memset(this,0,sizeof(_ECFaildConferenceMemberInfo));
	}

	_ECFaildConferenceMemberInfo(const _ECFaildConferenceMemberInfo& rOther)
	{
		*this = rOther;
	}
}ECFaildConferenceMemberInfo;

typedef struct _ECKickMemberInfo
{
	char memberId[BUF_LEN_256];//被踢出成员ID
	int memberIdType;//类型1: 落地电话号码，2: 应用账号
	int deviceType;

	_ECKickMemberInfo()
	{
		memset(this,0,sizeof(_ECKickMemberInfo));
	}

	_ECKickMemberInfo(const _ECKickMemberInfo& rOther)
	{
		*this = rOther;
	}
}ECKickMemberInfo;

typedef struct _ECConfNtyMembers
{
	char memberId[BUF_LEN_256];//成员ID
	int memberIdType;//类型1: 落地电话号码，2: 应用账号
	int state;//成员状态。详见ECUserState
	char userName[BUF_LEN_256];//成员名称
	char appData[1024];//扩展
	int roleId;//成员角色。0， 1. 创建者，2. 主持人，3.普通成员
	char phoneNum[BUF_LEN_64];//电话号码
	int version;//入会成员版本 7: 表示第三方客户端
	char videoSsrc[BUF_LEN_33];//视频ssrc
	int deviceType;

	_ECConfNtyMembers()
	{
		memset(this,0,sizeof(_ECConfNtyMembers));
	}

	_ECConfNtyMembers(const _ECConfNtyMembers& rOther)
	{
		*this = rOther;
	}
}ECConfNtyMembers;

typedef struct _ECConfWbInfo
{
	char userName[BUF_LEN_256];//成员名字
	char roomId[BUF_LEN_64];
	char userId[BUF_LEN_256];
	char password[BUF_LEN_256];
	int boardType;
	int roomType;

	_ECConfWbInfo()
	{
		memset(this, 0, sizeof(_ECConfWbInfo));
	}

	_ECConfWbInfo(const _ECConfWbInfo& rOther)
	{
		*this = rOther;
	}
}ECConfWbInfo;

typedef struct _ECConfRecordFile
{
	char confId[BUF_LEN_64];//会议ID
	char fileUrl[BUF_LEN_256];//录制文件下载地址
	int recordType;//录制文件类型 1：音频；2：视频； 3：音视频 ;
	char startTime[BUF_LEN_64];//开始时间
	char endTime[BUF_LEN_64];//结束时间

	_ECConfRecordFile()
	{
		memset(this, 0, sizeof(_ECConfRecordFile));
	}

	_ECConfRecordFile(const _ECConfRecordFile& rOther)
	{
		*this = rOther;
	}
}ECConfRecordFile;

typedef struct _ECConfNtyMsg
{
	char msgId[BUF_LEN_64];
	int type;//通知枚举。详见ECConfMsgType
	char confId[BUF_LEN_128];//会议ID
	char confName[BUF_LEN_256]; // 会议名字
	char confTopic[BUF_LEN_256];// 会议主题
	char startTime[BUF_LEN_64]; // 会议预约的开始时间
	char sendTime[BUF_LEN_64]; // 发送时间
	char password[BUF_LEN_33];//密码
	int state; // 会议当前状态。详见ECConfState
	int joinState; // 成员加入会议时状态;详见ECUserState
	int reserveEnable; // 是否启用预约功能。0:不启用，1：启用
	int callImmediately; // 是否立即开启会议。0:不启用，1：启用
	int action;// type相同状况下，action枚举区分,通过此字段来判断下面哪些字段是此通知传递的。详见ECControlAction
	char memberId[BUF_LEN_256];//更新会议信息的成员 //会议室通知中为会议室预定者
	int  memberIdType;//成员ID的类型1: 落地电话号码，2: 应用账号
	char creatorName[BUF_LEN_64];//创建者名字
	char creator[BUF_LEN_64]; //会议创建者ID
	int  creatorIdType; //会议创建者ID类型。1: 落地电话号码，2: 应用账号
	char inviter[BUF_LEN_256];//如果用户是被邀请加入的，则有此字段
	int inviterIdType;//邀请者ID的类型 1: 落地电话号码，2: 应用账号
	char inviterName[BUF_LEN_64]; // 邀请者名字
	char invitationId[BUF_LEN_512];//邀请通知的ID
	char invitee[BUF_LEN_128];//被邀请者
	int inviteeIdType;//被邀请者类型 1: 落地电话号码，2: 应用账号
	int kickCount;//被踢出成员个数
	ECKickMemberInfo* kickedMembers;//被踢出成员列表
	int memberCount;//更新的成员个数
	ECConfNtyMembers* members;//更新的成员列表
	int duration;//会议持续时间.单位：分钟
	char cause[BUF_LEN_33];//原因
	char cmdData[1024];//数据内容
	char appData[1024];//应用自定义的字符串,允许的最大长度为1024字节
	int unchangable; // 媒体控制 是否不可被目标成员更改0：否，1：是
	int remindBeforeStart;//会议开始前多久.单位：分钟.
	int remindBeforeEnd;//结束前多久.单位：分钟.
	char wbInfo[BUF_LEN_1024];//白板信息
	int deviceType;
    char nextEndTime[BUF_LEN_64]; //会议下一次可用结束时间 ，用于延长会议时间使用 。add by keven.
    char LayoutIdx[BUF_LEN_64]; //"-1"： 自动  ，"0" ： 首个大屏  ，"DEFAULT"：缺省布局，"NULL"：没有终端特定布局，"1_1" ：一大带一小，"1_3"：一大带三小  ，"1_5"：一大带五小。具体见会议接口文档
    char mainVenue[BUF_LEN_64]; //主会场的memberID （userID@deviceType）
    char LayoutPos[1024]; //布局json字符串，具体意义看会议接口文档
	int allMember;
	int isSquare;//0-非九宫格会议，1-九宫格会议
	char subtitle[BUF_LEN_1024];//字幕信息 {"method":0,"size":"40px","color":"red","location":1,"text":""}
	char turnType[BUF_LEN_256];//广播轮询 "1_3"
	//会议的会议室信息
	int confRoomInfoCount;
	ECConfInfoRoomInfo *confRoomInfos;//会议室信息.
	char comment[BUF_LEN_4096];//会议内容.
	//会议室通知信息
	char confRoomTopic[BUF_LEN_256];// 会议室主题
	char confRoomStartTime[BUF_LEN_64]; // 会议室开始时间
	char confRoomEndTime[BUF_LEN_64]; // 会议室结束时间
	char confRoomType[BUF_LEN_256]; // 会议室类型.
	char cityName[BUF_LEN_256];// 城市.
	char buildingName[BUF_LEN_256];// 建筑.
	char floorName[BUF_LEN_256];// 楼层.
	char confRoomName[BUF_LEN_256];// 会议室名称.
	char userPhone[BUF_LEN_256]; // 会议室预定者用户电话.

	_ECConfNtyMsg()
	{
		memset(this,0,sizeof(_ECConfNtyMsg));
		type = -1;
		state = -1;
		joinState = -1;
		callImmediately = -1;
		action = -1;
		memberIdType = -1;
		creatorIdType = -1;
		kickCount = 0;
		memberCount = 0;
		duration = -1;
		unchangable = -1;
		remindBeforeStart = -1;
		remindBeforeEnd = -1;
	}

	_ECConfNtyMsg(const _ECConfNtyMsg& rOther)
	{
		*this = rOther;
	}
}ECConfNtyMsg;

typedef struct _ECConfInviteNtyMsg
{
	char sender[BUF_LEN_512];//发送者
	int noteType;//6:邀请
	char confId[BUF_LEN_33];//会议id
	char confName[BUF_LEN_64];//会议名称
	char password[BUF_LEN_33];//密码
	char creatorName[BUF_LEN_64];//创建者名字
	char creator[BUF_LEN_64];
	int  creatorIdType;//会议创建者ID类型。1: 落地电话号码，2: 应用账号
	char inviter[BUF_LEN_64];//邀请者
	int inviterIdType;//邀请者类型 1: 落地电话号码，2: 应用账号
	char inviterName[BUF_LEN_64]; // 邀请者名字
	int callImmediately; // 是否立即开启会议。0:不启用，1：启用
	int reserveEnable; // 是否预约会议
	char sendTime[BUF_LEN_64];
	char startTime[BUF_LEN_64];
	int mediaType; // 媒体类型
	char appData[1024];//扩展字段

	_ECConfInviteNtyMsg()
	{
		memset(this,0,sizeof(_ECConfInviteNtyMsg));
	}

	_ECConfInviteNtyMsg(const _ECConfInviteNtyMsg& rOther)
	{
		*this = rOther;
	}
}ECConfInviteNtyMsg;

typedef struct _ECConfAppointmentNtyMsg
{
	int noteType;//24:预约
	char confId[BUF_LEN_33];//会议id
	char confName[BUF_LEN_64];//会议名称
	char password[BUF_LEN_33];//密码
	char startTime[BUF_LEN_33];//开始时间
	char inviter[BUF_LEN_64];//邀请者
	int inviterIdType;//邀请者类型 1: 落地电话号码，2: 应用账号
	int duration;//会议持续时间.单位：分钟
	char appData[1024];

	_ECConfAppointmentNtyMsg()
	{
		memset(this,0,sizeof(_ECConfAppointmentNtyMsg));
	}

	_ECConfAppointmentNtyMsg(const _ECConfAppointmentNtyMsg& rOther)
	{
		*this = rOther;
	}
}ECConfAppointmentNtyMsg;

typedef struct _ECConfBeforeStartNtyMsg
{
	int noteType;//25:会议开始前提醒
	char confId[BUF_LEN_33];//会议id
	char confName[BUF_LEN_64];//会议名称
	int remindBeforeStart;//会议开始前多久.单位：分钟.

	_ECConfBeforeStartNtyMsg()
	{
		memset(this,0,sizeof(_ECConfBeforeStartNtyMsg));
	}

	_ECConfBeforeStartNtyMsg(const _ECConfBeforeStartNtyMsg& rOther)
	{
		*this = rOther;
	}
}ECConfBeforeStartNtyMsg;

typedef struct _ECConfBeforeEndNtyMsg
{
	int noteType;//26:会议结束前提醒
	char confId[BUF_LEN_33];//会议id
	char confName[BUF_LEN_64];//会议名称
	int remindBeforeEnd;//结束前多久

	_ECConfBeforeEndNtyMsg()
	{
		memset(this,0,sizeof(_ECConfBeforeEndNtyMsg));
	}

	_ECConfBeforeEndNtyMsg(const _ECConfBeforeEndNtyMsg& rOther)
	{
		*this = rOther;
	}
}ECConfBeforeEndNtyMsg;

typedef struct _ECConfEndNtyMsg
{
	int noteType;//1:会议结束
	char confId[BUF_LEN_33];//会议id
	char confName[BUF_LEN_64];//会议名称

	_ECConfEndNtyMsg()
	{
		memset(this,0,sizeof(_ECConfEndNtyMsg));
	}

	_ECConfEndNtyMsg(const _ECConfEndNtyMsg& rOther)
	{
		*this = rOther;
	}
}ECConfEndNtyMsg;

//成员顺呼信息.
typedef struct _ECConfInviteMemberCalledSort
{
	char callMemberId[BUF_LEN_256];	//呼叫成员ID
	int callType;					//类型 1: 落地电话号码，2: 应用账号
}ECConfInviteMemberCalledSort;

typedef struct _ECConfInviteMember
{
	char memberId[BUF_LEN_256];//成员id
	int memberIdType;//类型 1: 落地电话号码，2: 应用账号
	int roleId;//角色。0， 1. 创建者，2. 主持人，3.普通成员
	char userName[BUF_LEN_256];//成员名称
	char phoneNumber[BUF_LEN_256];//关联电话，idType为应用账号时，才能有此字段。此时用户使用关联的电话参与会议
	int deviceType; // 多终端设备类型
	int calledSortCount; //成员顺呼信息数量.
	ECConfInviteMemberCalledSort *calledSort;//顺呼信息表（有值则按列表呼叫，否则使用memberId）.

	_ECConfInviteMember()
	{
		memset(this,0,sizeof(_ECConfInviteMember));
	}

	_ECConfInviteMember(const _ECConfInviteMember& rOther)
	{
		*this = rOther;
	}
}ECConfInviteMember;

typedef struct _ECConfKickMember
{
	char memberId[BUF_LEN_256];//成员id
	int memberIdType;//id类型 1: 落地电话号码，2: 应用账号
	int deviceType;

	_ECConfKickMember()
	{
		memset(this,0,sizeof(_ECConfKickMember));
	}

	_ECConfKickMember(const _ECConfKickMember& rOther)
	{
		*this = rOther;
	}
}ECConfKickMember;

typedef struct _ECConfAppSetting
{
	char notifyUrl[BUF_LEN_512];//会议通知的回调url。当会议中产生了通知时，调用这个url进行通知发送（通知内容统一定义）
	int subNotificationsCount;//订阅的通知类型列表长度
	int*subNotifications;//订阅的通知类型，列表
	char verifyUrl[BUF_LEN_512];//会议认证的回调url,默认为空
	char confBaseUrl[BUF_LEN_512];//会议web服务器的base url，会议平台根据这个字段组装此会议的url
	int telNumCount;//会议呼入电话号码列表长度
	char** telNum;//会议呼入电话号码，列表。
	int maxMember;//会议最大成员数 
	int mediaVendor;//提供媒体功能的厂商(可忽略) 1：云通讯 2：avaya
	char appData[1024];//应用层透传的数据
	char createTime[BUF_LEN_33];//创建时间
	char updateTime[BUF_LEN_33];//更新时间
	int multiTerminal; // 是否开启多终端
	int isShowRecord; //是否展示录制选项，0-不展示，1-展示
	int isShowConfRoom; //是否展示会议室预定选项，0-不展示，1-展示
	int isShowPlace; //是否展示会议地点选项，0-不展示，1-展示
	int ScreenNum; //可投屏数量
	int PhoneSetting; //0-不展示 1-只展示电话 2-只展示短信 3-电话，短信都展示
	int minMember; //会议最小成员数
	int allowCallPhone; //是否允许会中呼叫落地电话 0-否 1-是

	_ECConfAppSetting()
	{
		memset(this,0,sizeof(_ECConfAppSetting));
	}

	_ECConfAppSetting(const _ECConfAppSetting& rOther)
	{
		*this = rOther;
	}
}ECConfAppSetting;

typedef struct _ECConferenceParticipantMemberInfo
{
	char memberId[BUF_LEN_256];//成员id
	int memberIdType;
	int deviceType;

	_ECConferenceParticipantMemberInfo()
	{
		memset(this,0,sizeof(_ECConferenceParticipantMemberInfo));
	}

	_ECConferenceParticipantMemberInfo(const _ECConferenceParticipantMemberInfo& rOther)
	{
		*this = rOther;
	}
} ECConferenceParticipantMemberInfo;
typedef struct _ECConferenceRecordMemberInfo
{
	char memberId[BUF_LEN_256];//成员id
	int idType;

	_ECConferenceRecordMemberInfo()
	{
		memset(this, 0, sizeof(_ECConferenceParticipantMemberInfo));
	}
	~_ECConferenceRecordMemberInfo()
	{
		printf("~_ECConferenceRecordMemberInfo()");
	}

	_ECConferenceRecordMemberInfo(const _ECConferenceRecordMemberInfo& rOther)
	{
		*this = rOther;
	}
}ECConferenceRecordMemberInfo;

typedef struct _ECCHardwareInfo
{
	char wifiId[BUF_LEN_64];
	char hardwareId[BUF_LEN_64];
	char hardwareSignalIp[BUF_LEN_64];
	char codecPayloadName[BUF_LEN_64];
	int hardwareSignalPort;
	int remoteVideoPort;
	int localVideoPort;
	int localVideoSSRC;
	int codecPayloadType;
	int registerStatus;//-1 is unregister, 0 is register failure, 1 is register success
	int updateStatus;//1 add, 2 update, 3 remove
	_ECCHardwareInfo()
	{
		memset(this, 0, sizeof(_ECCHardwareInfo));
		registerStatus = -1;
		codecPayloadType = -1;
	}

	_ECCHardwareInfo(const _ECCHardwareInfo& rOther)
	{
		*this = rOther;
	}

	_ECCHardwareInfo& operator=(const _ECCHardwareInfo& rOther)
	{
		memcpy(this, &rOther, sizeof(rOther));
		return *this;
	}

}ECCHardwareInfo;


/****************************************会议通知接口*******************************************/
typedef void (*onReceivedConferenceNotification)(ECConfNtyMsg* pMsg, const char *jsonString);//会议通知
typedef void (*onReceivedConferenceThreePartNotification)(const char* confId, int callType, int event, const char* jsonString);
typedef void (*onReceivedConferenceInviteNotification)(ECConfInviteNtyMsg* pMsg, const char *jsonString);//邀请通知 注意:废弃函数，包括下面的都统一到第一个通知回调用
typedef void (*onReceivedConferenceAppointmentNotification)(ECConfAppointmentNtyMsg* pMsg, const char* jsonString);//预约会议通知
typedef void (*onReceivedConferenceBeforeStartNotification)(ECConfBeforeStartNtyMsg* pMsg, const char* jsonString);//会议开始前通知
typedef void (*onReceivedConferenceBeforeEndNotification)(ECConfBeforeEndNtyMsg* pMsg, const char* jsonString);//会议结束前通知
typedef void (*onReceivedConferenceEndNotification)(ECConfEndNtyMsg* pMsg, const char* jsonString);//会议结束通知

/********************************************会议回调接口***********************************************/
typedef void (*onCreateConference)(unsigned int matchKey, int reason, const char* confId, const char* jsonString);//创建会议 200成功，其他失败；
typedef void (*onDeleteConference)(unsigned int matchKey, int reason, const char* jsonString);//删除会议 200成功， 其他失败；
typedef void (*onUpdateConference)(unsigned int matchKey, int reason, const char* jsonString);//更新会议 200成功， 其他失败；
typedef void (*onUpdateHistoryConference)(unsigned int matchKey, int reason, const char* jsonString);//更新会议 200成功， 其他失败；
typedef void (*onGetConferenceInfo)(unsigned int matchKey, int reason, ECConfInfo* pInfo, const char* jsonString);//获取会议信息 200成功， 其他失败；
typedef void (*onGetConferenceInfoList)(unsigned int matchKey,int reason, int count, ECConfInfo* pInfo, const char* jsonString);//获取会议信息列表 200成功， 其他失败；
typedef void (*onGetHistoryConferenceInfoList)(unsigned int matchKey, int reason, int count, ECConfInfo* pInfo, const char* jsonString);//获取历史会议列表 200成功， 其他失败；
typedef void (*onDelHistoryConferenceInfoList)(unsigned int matchKey, int reason, const char* jsonString);
typedef void (*onLockConference)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//锁定解锁定会议 200成功， 其他失败；
typedef void (*onMemberJoinConference)(unsigned int matchKey, int reason, ECConfInfo *pInfo, const char* jsonString);//用户加入会议 200成功， 其他失败；
typedef void (*onMemberQuitConference)(unsigned int matchKey, int reason, const char* jsonString);//用户退出会议 200成功， 其他失败；
typedef void (*onUpdateConferenceMember)(unsigned int matchKey, int reason, const char* jsonString);//更新会议成员信息 200成功， 其他失败；
typedef void (*onGetConferenceMemberInfo)(unsigned int matchKey, int reason, const char* confId, ECConferenceMemberInfo* pInfo, const char* jsonString);//获取会议成员信息 200成功， 其他失败；
typedef void (*onGetConferenceMemberInfoList)(unsigned int matchKey, int reason, const char* confId, int count, ECConferenceMemberInfo* pInfo, const char* jsonString);//获取会议成员信息列表 200成功， 其他失败；
typedef void (*onConferenceInviteMember)(unsigned int matchKey, int reason, const char* confId, int faildCount, ECFaildConferenceMemberInfo* pFaildMemberInfo, const char* jsonString);//邀请成员加入会议 200成功， 其他失败；
typedef void (*onConferenceMemberAcceptInvitation)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//接受邀请  200成功， 其他失败；
typedef void (*onConferenceMemberRejectInvitation)(unsigned int matchKey, const char* confId,int reason, const char* jsonString);//拒绝邀请  200成功， 其他失败；
typedef void (*onConferenceKickoutMember)(unsigned int matchKey, int reason, const char* confId, int faildCount, ECFaildConferenceMemberInfo* pFaildMemberInfo, const char* jsonString);//踢出会议成员 200成功， 其他失败；
typedef void (*onSetConferenceMemberRole)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//设置成员角色 200成功， 其他失败；
typedef void (*onGetHistoryConferenceMemberInfoList)(unsigned int matchKey, const char* confId, int reason, int count, ECConferenceMemberInfo* pInfo, const char* jsonString);//获取历史成员列表  200成功， 其他失败；
typedef void (*onConferenceSendCmd)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//透传rest 200成功， 其他失败；
typedef void (*onConferenceMediaControl)(unsigned int matchKey, int reason, const char* jsonString);//会议媒体控制 200成功， 其他失败；
typedef void (*onConferenceRecord)(unsigned int matchKey, int reason, const char* jsonString);//会议录制控制 200成功， 其他失败；
typedef void (*onConferenceRecordStart)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//会议录制开始 200成功， 其他失败；
typedef void (*onConferenceRecordPause)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//会议录制暂停 200成功， 其他失败；
typedef void (*onConferenceRecordResume)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//会议录制恢复 200成功， 其他失败；
typedef void (*onConferenceRecordStop)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//会议录制停止 200成功， 其他失败；
typedef void (*onGetConferenceRecordList)(unsigned int matchKey, const char* confId, int reason, int count, ECConfRecordFile* pInfo);//获取会议录制文件列表
typedef void (*onGetConferenceRecordSessions)(unsigned int matchKey, const char* confId, int reason, const char* jsonString);//获取会议录制会话列表 200成功， 其他失败；
typedef void (*onConferenceAudioPlay)(unsigned int matchKey, int reason, const char* jsonString);//会议放音控制 200成功， 其他失败；
typedef void (*onConferenceStartPublishVideo)(unsigned int matchKey,int reason, const char* jsonString);//发布视频 200成功， 其他失败；
typedef void (*onConferenceStopPublishVideo)(unsigned int matchKey, int reason, const char* jsonString);//停止发布视频 200成功， 其他失败；
typedef void (*onConferenceExtendDuration)(unsigned int matchKey, int reason, const char* jsonString);//延长会议时长 200成功， 其他失败；
typedef void (*onConferenceCommon)(unsigned int matchKey, int reason, const char* jsonString);//会议通用接口回调 200成功， 其他失败； add by keven
typedef void (*onConferenceStartPublishVoice)(unsigned int matchKey, int reason, const char* jsonString);//发布音频 200成功， 其他失败；
typedef void (*onConferenceStopPublishVoice)(unsigned int matchKey, int reason, const char* jsonString);//停止发布音频 200成功， 其他失败；
typedef void (*onConferenceStartScreenSharing)(unsigned int matchKey, int reason, const char* jsonString);//开始共享桌面 200成功， 其他失败；
typedef void (*onConferenceStopScreenSharing)(unsigned int matchKey, int reason, const char* jsonString);//停止共享桌面 200成功， 其他失败；
typedef void (*onConferenceRequestMemberVideo)(int reason,const char *confId,const char *member,int mediaSourceType, const char* jsonString);//申请远端视频  0成功，其他失败；详见ECConference_status
typedef void (*onConferenceCancelMemberVideo)(int reason,const char *confId, const char *member,int mediaSourceType, const char* jsonString);//取消申请视频源  0成功，其他失败；详见ECConference_status
typedef void (*onConferenceGetAppSetting)(unsigned int matchKey, int reason, ECConfAppSetting* pSetting);//获取应用下的总的会议设置信息 200成功， 其他失败；
typedef void (*onConferenceParticipantNotification)(const char* confId, int count, ECConferenceParticipantMemberInfo* pInfo); // 获取声音最大成员通知
typedef void (*onGetConferenceRoomList)(unsigned int matchKey, int reason, int count, ECConfRoomInfo *pInfo);//获取会议室
typedef void (*onGetConferenceSummaryList)(unsigned int matchKey, int reason, int count, ECConfSummary *pInfo);// 获取只能会议室列表

typedef void (*onConferenceMediaTimeout)(const char* confId, int reason, const char* jsonString);//会中本地媒体检测超时回调.

// 会议中共享白板
typedef void (*onConferenceStartWhiteboardSharing)(unsigned int matchKey, int reason);
typedef void (*onConferenceStopWhiteboardSharing)(unsigned int matchKey, int reason);

//白板
typedef void (*onConferenceOpenWhiteboard)(unsigned int matchKey, const char* confId,int reason, const char* jsonString);//打开白板 200成功， 其他失败；
typedef void (*onConferenceCloseWhiteboard)(unsigned int matchKey, const char* confId,int reason, const char* jsonString);//关闭白板 200成功， 其他失败；
	/**
	*  自动文档共享回调
	*  reason state状态正常时reason错误码无意义，反之state状态异常，reason存放异常错误码;
	*  state  自动文档共享状态回调，一般只关心是否为CCP_SHAREDOC_ALL_SUCCESS
	typedef enum _CCP_ShareDocState {
		CCP_SHAREDOC_ALL_SUCCESS = 200,
		CCP_SHAREDOC_UPLOAD_FILE_SUCCESS=201,
		CCP_SHAREDOC_DOC_CONVERT_SUCCESS=202,
		CCP_SHAREDOC_DOWNLOAD_FILES_SUCCESS=203,
		CCP_SHAREDOC_UPLOADING_FILE=204,
		CCP_SHAREDOC_DOC_CONVERTING=205,
		CCP_SHAREDOC_DOC_DOWNLOADING=206,
		CCP_SHAREDOC_INTERNAL_ERROR=207
	} CCP_ShareDocState;
	*/
typedef void (*onAutoShareDoc)(unsigned int matchKey,int reason,int state, int docId, int currentPageIndex, int pageNum, const char* jsonString);//共享文档 200成功， 其他失败；

typedef void (*onSwitchWhiteboardOrDoc)(unsigned int matchKey,int reason, const char* jsonString);//切换白板和文档 200成功， 其他失败；
typedef void (*onClearWhiteboardCurrentPage)(unsigned int matchKey,int reason, const char* jsonString);//清除当前页 200成功， 其他失败；
typedef void (*onGotoWhiteboardPage)(unsigned int matchKey,int reason, const char* jsonString);//跳转到某页 200成功， 其他失败；
typedef void (*onDrawUndoWhiteboard)(unsigned int matchKey,int reason, const char* jsonString);//撤销 200成功， 其他失败；
typedef void (*onDrawRedoWhiteboard)(unsigned int matchKey,int reason, const char* jsonString);//恢复 200成功， 其他失败；

typedef void(*onHardwareResponse)(unsigned int matchKey, const char *jsonString);//硬件信令请求的响应
typedef void(*onHardwareNotify)(unsigned int notifyType, const char *jsonString);//硬件信令通知
typedef void(*onHardwareInfoUpdate)(const ECCHardwareInfo *pItem);//硬件信息更新通知

typedef void(*onGetConferenceDeviceFromCode)(unsigned int matchKey, int reason, const char* jsonString);//根据投屏码获取设备.

//回调结构体
typedef struct _ConfCallBackInterface
{
	onReceivedConferenceNotification             pfonReceivedConferenceNotification;
	onReceivedConferenceThreePartNotification    pfonReceivedConferenceThreePartNotification;
	onCreateConference                           pfonCreateConference;
	onDeleteConference                           pfonDeleteConference;
	onUpdateConference                           pfonUpdateConference;
	onUpdateHistoryConference					 pfonUpdateHistoryConference;
	onGetConferenceInfo                          pfonGetConferenceInfo;
	onGetConferenceInfoList                      pfonGetConferenceInfoList;
	onGetHistoryConferenceInfoList               pfonGetHistoryConferenceInfoList;
	onDelHistoryConferenceInfoList               pfonDelHistoryConferenceInfoList;
	onLockConference                             pfonLockConference;
	onMemberJoinConference                       pfonMemberJoinConference;
	onMemberQuitConference                       pfonMemberQuitConference;
	onUpdateConferenceMember                     pfonUpdateConferenceMember;
	onGetConferenceMemberInfo                    pfonGetConferenceMemberInfo;
	onGetConferenceMemberInfoList                pfonGetConferenceMemberInfoList;
	onConferenceInviteMember                     pfonConferenceInviteMember;
	onConferenceMemberAcceptInvitation			 pfonConferenceMemberAcceptInvitation;
	onConferenceMemberRejectInvitation           pfonConferenceMemberRejectInvitation;
	onConferenceKickoutMember                    pfonConferenceKickoutMember;
	onSetConferenceMemberRole                    pfonSetConferenceMemberRole;
	onGetHistoryConferenceMemberInfoList         pfonGetHistoryConferenceMemberInfoList;
	onConferenceSendCmd                          pfonConferenceSendCmd;
	onConferenceMediaControl                     pfonConferenceMediaControl;
	onConferenceRecord                           pfonConferenceRecord;
	onGetConferenceRecordList				     pfonGetConferenceRecordList;
	onConferenceAudioPlay                        pfonConferenceAudioPlay;
	onConferenceStartPublishVideo                pfonConferenceStartPublishVideo;
	onConferenceStopPublishVideo                 pfonConferenceStopPublishVideo;
    onConferenceExtendDuration					 pfonConferenceExtendDuration;
    onConferenceCommon							 pfonConferenceCommon;
	onConferenceStartScreenSharing               pfonConferenceStartScreenSharing;
	onConferenceStopScreenSharing                pfonConferenceStopScreenSharing;
	onConferenceStartPublishVoice                pfonConferenceStartPublishVoice;
	onConferenceStopPublishVoice                 pfonConferenceStopPublishVoice;
	onConferenceRequestMemberVideo               pfonConferenceRequestMemberVideo;
	onConferenceCancelMemberVideo                pfonConferenceCancelMemberVideo;

	onConferenceStartWhiteboardSharing			 pfonConferenceStartWhiteboardSharing;
	onConferenceStopWhiteboardSharing			 pfonConferenceStopWhiteboardSharing;

	onReceivedConferenceInviteNotification       pfonReceivedConferenceInviteNotification; // 新版本废弃，合并到onReceivedConferenceNotification
	onReceivedConferenceAppointmentNotification  pfonReceivedConferenceAppointmentNotification; // 同上
	onReceivedConferenceBeforeStartNotification  pfonReceivedConferenceBeforeStartNotification; // 同上
	onReceivedConferenceBeforeEndNotification    pfonReceivedConferenceBeforeEndNotification; // 同上
	onReceivedConferenceEndNotification          pfonReceivedConferenceEndNotification; // 同上
	onConferenceGetAppSetting                    pfonConferenceGetAppSetting;
	onConferenceParticipantNotification			 pfonConferenceParticipantNotification;
	onGetConferenceRoomList                      pfonGetConferenceRoomList;
	onGetConferenceSummaryList					 pfonGetConferenceSummaryList;

	onConferenceOpenWhiteboard                   pfonConferenceOpenWhiteboard;
	onConferenceCloseWhiteboard                  pfonConferenceCloseWhiteboard;
	onAutoShareDoc                               pfonAutoShareDoc;
	onSwitchWhiteboardOrDoc                      pfonSwitchWhiteboardOrDoc;
	onClearWhiteboardCurrentPage                 pfonClearWhiteboardCurrentPage;
	onGotoWhiteboardPage                         pfonGotoWhiteboardPage;
	onDrawUndoWhiteboard                         pfonDrawUndoWhiteboard;
	onDrawRedoWhiteboard                         pfonDrawRedoWhiteboard;

	onHardwareResponse							 pfonHardwareResponse;
	onHardwareNotify							 pfonHardwareNotify;
	onHardwareInfoUpdate						 pfonHardwareInfoUpdate;

	onConferenceRecordStart                      pfonConferenceRecordStart;
	onConferenceRecordPause                      pfonConferenceRecordPause;
	onConferenceRecordResume                     pfonConferenceRecordResume;
	onConferenceRecordStop                       pfonConferenceRecordStop;
	onGetConferenceRecordSessions				 pfonGetConferenceRecordSessions;

	onGetConferenceDeviceFromCode				 pfonGetConferenceDeviceFromCode;

	onConferenceMediaTimeout					 pfonConferenceMediaTimeout;

	_ConfCallBackInterface():pfonReceivedConferenceNotification(NULL),pfonReceivedConferenceThreePartNotification(NULL),pfonCreateConference(NULL),pfonDeleteConference(NULL),pfonUpdateConference(NULL), pfonUpdateHistoryConference(NULL), pfonGetConferenceInfo(NULL),
		pfonGetConferenceInfoList(NULL),pfonGetHistoryConferenceInfoList(NULL), pfonDelHistoryConferenceInfoList(NULL), pfonLockConference(NULL),pfonMemberJoinConference(NULL),pfonMemberQuitConference(NULL),pfonUpdateConferenceMember(NULL),
		pfonGetConferenceMemberInfo(NULL),pfonGetConferenceMemberInfoList(NULL),pfonConferenceInviteMember(NULL), pfonConferenceMemberAcceptInvitation(NULL),pfonConferenceMemberRejectInvitation(NULL),pfonConferenceKickoutMember(NULL),
		pfonSetConferenceMemberRole(NULL),pfonConferenceSendCmd(NULL),pfonGetHistoryConferenceMemberInfoList(NULL),pfonConferenceMediaControl(NULL),pfonConferenceRecord(NULL),pfonConferenceAudioPlay(NULL),pfonConferenceStartPublishVideo(NULL),
		pfonConferenceStopPublishVideo(NULL),pfonConferenceExtendDuration(NULL),pfonConferenceCommon(NULL),pfonConferenceStartScreenSharing(NULL),pfonConferenceStopScreenSharing(NULL),pfonConferenceStartPublishVoice(NULL),pfonConferenceStopPublishVoice(NULL),
		pfonConferenceRequestMemberVideo(NULL),pfonConferenceCancelMemberVideo(NULL), pfonConferenceStartWhiteboardSharing(NULL), pfonConferenceStopWhiteboardSharing(NULL),pfonReceivedConferenceInviteNotification(NULL),pfonReceivedConferenceAppointmentNotification(NULL),
		pfonReceivedConferenceBeforeStartNotification(NULL),pfonReceivedConferenceBeforeEndNotification(NULL),pfonReceivedConferenceEndNotification(NULL),pfonConferenceGetAppSetting(NULL),pfonConferenceParticipantNotification(NULL),

		pfonConferenceOpenWhiteboard(NULL), pfonConferenceCloseWhiteboard(NULL), pfonAutoShareDoc(NULL), pfonSwitchWhiteboardOrDoc(NULL), pfonClearWhiteboardCurrentPage(NULL), pfonGotoWhiteboardPage(NULL), pfonDrawUndoWhiteboard(NULL),
		pfonDrawRedoWhiteboard(NULL), pfonGetConferenceRoomList(NULL), pfonGetConferenceSummaryList(NULL), pfonGetConferenceRecordList(NULL)
		, pfonHardwareResponse(NULL), pfonHardwareNotify(NULL), pfonHardwareInfoUpdate(NULL), pfonConferenceRecordStart(NULL), pfonConferenceRecordPause(NULL), pfonConferenceRecordResume(NULL), pfonConferenceRecordStop(NULL), pfonGetConferenceRecordSessions(NULL),
		pfonGetConferenceDeviceFromCode(NULL), pfonConferenceMediaTimeout(NULL)
	{

	}

}ECConfCallBackInterface;

#pragma pack ()

#endif//_EC_CONF_MEETING_STRUCT_DEFINE_H
