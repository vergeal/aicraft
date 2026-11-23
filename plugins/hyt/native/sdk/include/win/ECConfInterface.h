#ifndef _EC_CONF_MEETING_INTERFACE_H
#define _EC_CONF_MEETING_INTERFACE_H

#include "ECConfStructDef.h"

#ifdef __cplusplus
extern "C" 
{
#endif

//////////////////////////////////////////////////回调函数接口///////////////////////////////////////////////////////////
	//回调设置接口，必须在主调前调用
	EC_CALL_API void SetConfCallBackFuction(ECConfCallBackInterface *confInterface);

//////////////////////////////////////////////////主调函数接口///////////////////////////////////////////////////////////
	
	 /*! @function
	 ********************************************************************************
	 函数名: GetConferenceRoomList
	 功能  : 获取会议室列表
	 参数  : [IN]  matchKey        : 流水号
			 [IN]  memberIdType    : memberId的类型，应用账号还是落地电话号码。1: 电话号码，2: 应用账号
			 [IN]  memberId        : 搜索条件：账号
			 [IN]  roomId          : 搜索条件：会议室ID
			 [IN]  confRoomType    : 会议室类型.(无效，底层默认)
			 [IN]  allowCallOut    : 是否容许外呼(无效，底层默认)
			 [IN]  startTime       : 开始时间(无效，底层默认)
			 [IN]  endTime		   : 结束时间(无效，底层默认)

			 注意:memberId与confRoomId至少有一个非空.
	 返回值   : 0成功； 非0失败
	 回调函数 ：void (*onGetConferenceRoomList)
	 *******************************************************************************/
	 EC_CALL_API int GetConferenceRoomList(unsigned int* matchKey, int memberIdType, const char* memberId, const char* roomId, int confRoomType, int allowCallOut, const char* startTime, const char* endTime);

	 /*! @function
	********************************************************************************
	函数名: GetConferenceRoomList
	功能  : 获取会议室列表
	参数  : [IN]  matchKey        : 流水号
			[IN]  memberIdType    : memberId的类型，应用账号还是落地电话号码。1: 电话号码，2: 应用账号
			[IN]  memberId        : 搜索条件：账号
			[IN]  roomId          : 搜索条件：会议室ID
			[IN]  cityId		  : 城市ID(-1不选)
			[IN]  buildingId      : 建筑ID(-1不选)
			[IN]  occupiesStatus  : 状态(-1不选) 0-空闲，1-占用
			[IN]  keyword		  : 模糊搜索关键字(一般为空)
			[IN]  startTime       : 开始时间(无效)
			[IN]  endTime		  : 结束时间(无效)
			[IN]  pageNo		  : 按页返回(-1不选)，获取第几页的内容 默认为0，0为第一页
			[IN]  pageSize		  : 按页返回(-1不选)，每页返回的数据个数 默认值1000，最大值2000
			[IN]  snCode		  : 会议室硬件设备代码.
			[IN]  jsonString	  : 扩展字段(备用)

			注意:memberId与confRoomId至少有一个非空.
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGetConferenceRoomList)
	*******************************************************************************/
	 EC_CALL_API int GetConferenceRoomListEx(unsigned int* matchKey, int memberIdType, const char* memberId, const char* roomId, int cityId, int buildingId, int occupiesStatus, const char *keyword, const char* startTime, const char* endTime, int pageNo, int pageSize, const char *snCode, const char *jsonString);

	 /*! @function
	 ********************************************************************************
     函数名: CreateConference
     功能  : 创建会议
     参数  : [IN]  matchKey           : 流水号
             [IN]  ownerPassword      : 创建者密码。如果没有设置，则不通过密码来区分用户的角色，如果设置了，则使用此密码加入会议的成员自动获取到会议创建者角色
             [IN]  password           : 会议密码
			 [IN]  confName           : 会议名称
             [IN]  confType           : 会议类型。0：临时会议；1：永久会议；默认值：0
			 [IN]  maxMember          : 会议最大成员数。最大不能超过应用中设置的最大数值。默认值：5
             [IN]  voiceMode          : 0没有提示音只有背景音、1有加入退出提示音及背景音、2无提示音无背景音、3有提示音无背景音。默认值为3；          
             [IN]  appData            : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  autoClose	      : 主持人离开会议后，会议是否自动结束 0:否，1：是,默认值1
			 [IN]  moderator	      : 指定会议主持人ID
			 [IN]  startTime	      : 预约的会议中使用这个字段，会议开始时间，格式：yyyy-MM-dd HH:mm:ss，例如：2017-01-01 00:00:00
			 [IN]  members	          : 预约的会议中使用这个字段，预约的参会成员，例如members:[{"memberId":"xxx","idType":1}, {...}, ...],ECConfMembers
			 [IN]  membersCount       : 预约的会议中使用这个字段，预约的参会成员个数
			 [IN]  duration	          : 预约的会议中使用这个字段，会议持续时间，单位：分钟 默认值60
			 [IN]  sendInvitation     : 到时间之后是否发送入会邀请（对于应用账号发送邀请通知，对于手机号发起邀请呼叫）0：否，1：是;默认值 1
			 [IN]  sendReserveNote    : 启用预约的会议中使用这个字段，是否给会议成员发送提醒通知（提醒成员被列入预约会议成员） 0：否，1：是 默认值 0
			 [IN]  remindBeforeStart  : 预约的会议中使用这个字段，会议开始前多久发送提醒通知，单位：分钟.默认值10
			 [IN]  remindBeforeEnd	  : 预约的会议中使用这个字段，会议结束前多久发送提醒通知，单位：分钟默认值10
			 [IN]  mediaType	      : 0:落地电话会议 1:多路视频会议 2:混屏视频会议 3:多路+混屏视频会议 4:实时对讲 5: 有序发言，限制同时发布语音的人数 默认值：1
			 [IN]  reserveEnable      : 是否启用预约功能,0:不启用，1：启用;
										 启用预约功能时
										 在预约结束时间之后（startTime+duration），才会自动结束
										 在预约结束时间之前，用户可随时加入并使用会议，接口不做任何限制，且confType和autoClose参数不起作用
			 [IN]  confTopic		  : 会议议题
			 [IN]  joinState		  : 成员入会时状态(是否打开语音或视频)，取值同获取会议成员信息接口返回的state值，默认打开语音和视频
			 [IN]  confRoomId         : 指定会议室ID
			 [IN]  allowCallOut		  : 是否允许电话参会功能，启用后，此会议，才允许外呼成员手机号 0不启用；1启用；默认1，表示启用
			 [IN]  chatInConf		  : 是否启用会中IM
										 chatInConf=1 表示 启用会中IM功能
										 chatInConf=0 表示 不启用会中IM功能
			 [IN]  jsonString		  : 扩展字段(没用到可以不列出): {
											"version":"Number 可选 -1代表默认 默认值由后台配置决定",
											"contentType":"Number 可选 会议事件类型 -1代表默认 默认值由后台配置决定",
											"autoLive":"Number 可选 -1代表默认 默认值由后台配置决定, 0 不直播 1 直播",
											"seqCall":"Number 可选 -1代表默认 多端情况下是否同振铃,针对含有用户呼叫列表时有效, 0 顺振 1 同振",
											"confPlace":"String 可选 会议地点 默认为空",
											"bookIds":"String 可选 会议室预定ID列表 默认为空，格式{\"bookIds\":[1,2,3,5]}",
											"comment":"String 可选 会议室内容 默认为空",
											"autoRecord":"Number 可选 是否自动录制 -1代表默认 0 不录制 1 录制所有成员",
											"creatorName":"String 可选 创建者名称",
											"bookInfos":"string 会议室预订信息列表, 格式{\"bookInfos\":[{
																	\"confRoomId\":\"string 会议室Id\",
																	\"startTime\":\"string 开始时间\",
																	\"endTime\":\"string 结束时间\",
																	\"confRoomType\":\"string 会议室类型\",
																	\"confRoomTopic\":\"string 会议室主题\",
																	\"userPhone\":\"string 预订者手机号\"
																}]
															}"
										}
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onCreateConference)
	 *******************************************************************************/
    EC_CALL_API int CreateConference(unsigned int* matchKey, const char* ownerPassword, const char* password, const char* confName, int confType, int maxMember, int voiceMode,
		const char* appData, int autoClose, const char* moderator, const char* startTime, ECConfMembersContainRoleId*pMembers, int membersCount, int duration, int sendInvitation,
		int sendReserveNote, int remindBeforeStart, int remindBeforeEnd, int mediaType, int reserveEnable, const char* confTopic, int joinState, const char* confRoomId, int allowCallOut,int chatInConf,const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: DeleteConference
     功能  : 删除会议
     参数  : [IN]  matchKey      : 流水号
             [IN]  confId        : (必选)会议ID
             [IN]  appData       : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  jsonString    : 扩展字段(没用到可以不列出): {
											"bookIds":"String 会议室预定ID列表 可选 默认为空，格式{\"bookIds\":[1,2,3,5]} 备注：如果用户点击释放会议室，则传递，否则为空."
										}
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onDeleteConference)
    *******************************************************************************/
    EC_CALL_API int DeleteConference(unsigned int* matchKey, const char* confId,  const char* appData, const char* jsonString);
        
	/*! @function
    ********************************************************************************
     函数名: UpdateConference
     功能  : 更新会议
     参数  : [IN]  matchKey           : 流水号
			 [IN]  confId             : (必选)会议ID
             [IN]  ownerPassword      : 创建者密码。如果没有设置，则不通过密码来区分用户的角色，如果设置了，则使用此密码加入会议的成员自动获取到会议创建者角色
             [IN]  password           : 会议密码
			 [IN]  confName           : 会议名称
             [IN]  confType           : 会议类型。0：临时会议；1：永久会议。默认值：0
			 [IN]  maxMember          : 会议最大成员数。最大不能超过应用中设置的最大数值。默认值：5
             [IN]  voiceMode          : 0没有提示音只有背景音、1有加入退出提示音及背景音、2无提示音无背景音、3有提示音无背景音。默认值为3；          
             [IN]  appData            : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  autoClose	      ：主持人离开会议后，会议是否自动结束   0:否，1：是,默认值1
			 [IN]  moderator	      : 指定会议主持人ID
			 [IN]  members	          : 预约的会议中使用这个字段，预约的参会成员，例如members:[{"memberId":"xxx","memberIdType":1}, {...}, ...],ECConfMembers
			 [IN]  membersCount       : 预约的会议中使用这个字段，预约的参会成员个数
			 [IN]  startTime	      : 预约的会议中使用这个字段，会议开始时间，格式：yyyy-MM-dd HH:mm:ss，例如：2017-01-01 00:00:00
			 [IN]  duration	          : 预约的会议中使用这个字段，会议持续时间，单位：分钟 默认值60
			 [IN]  sendInvitation     : 到时间之后是否发送入会邀请（对于应用账号发送邀请通知，对于手机号发起邀请呼叫）0：否，1：是;默认值 1
			 [IN]  remindBeforeStart  : 预约的会议中使用这个字段，会议开始前多久发送提醒通知，单位：分钟.默认值10
			 [IN]  remindBeforeEnd	  : 预约的会议中使用这个字段，会议结束前多久发送提醒通知，单位：分钟默认值10
			 [IN]  mediaType	      : 0:落地电话会议 1:多路视频会议 2:混屏视频会议 3:多路+混屏视频会议
			 [IN]  reserveEnable      : 是否启用预约功能,0:不启用，1：启用;
										 启用预约功能时
										 在预约结束时间之后（startTime+duration），才会自动结束
										 在预约结束时间之前，用户可随时加入并使用会议，接口不做任何限制，且confType和autoClose参数不起作用
			 [IN]  confTopic		  : 会议议题
		     [IN]  joinState		  : 成员入会时状态(是否打开语音或视频)，取值同获取会议成员信息接口返回的state值，默认打开语音和视频
			 [IN]  allowCallOut		  : 是否允许电话参会功能，启用后，此会议，才允许外呼成员手机号 0不启用；1启用；默认1，表示启用
			 [IN]  jsonString         : 扩展字段：{
													"subtitle":"string 字幕信息 格式{
																					"method" : "number 默认0 显示方式 0:循环滚动，1:固定"
																					"size" : "string 默认40px 字体大小 40px,60px,100px",
																					"color" : "string red 字体颜色 ",
																					"location" : "string 1 位置 0:顶部,1:中部,2:底部",
																					"text" : "文本内容"
																				}",
													"turnType":"string 轮询 格式 1_3",
													"bookIds":"string 会议室预定ID列表 格式 {"bookIds":[1,2,3,5]}",
													"comment":"string 会议内容",
													"place":"string 会议地点",
													"bookInfos":"string 预定会议室信息 格式 {"bookInfos":[{
																									"confRoomId":"string 会议室Id",
																									"startTime":"string 开始时间",
																									"endTime":"string 结束时间",
																									"confRoomType":"string 会议室类型",
																									"confRoomTopic":"string 会议室主题",
																									"userPhone":"string 预订者手机号"
																								}]
																							}"
												}

	返回值   : 0成功； 非0失败
	回调函数 ：void (*onUpdateConference)
    *******************************************************************************/
	EC_CALL_API int UpdateConference(unsigned int* matchKey, const char* confId, const char* ownerPassword, const char* password, const char* confName,int confType,
		int maxMember, int voiceMode, const char* appData, int autoClose, const char* moderator, ECConfMembersContainRoleId* members, int membersCount, const char* startTime, int duration,
		int sendInvitation, int remindBeforeStart, int remindBeforeEnd, int mediaType, int reserveEnable,  const char* confTopic, int joinState, int allowCallOut, const char* jsonString);

	/*! @function
	********************************************************************************
	函数名: UpdateHistoryConference
	功能  : 更新历史会议议题(以后可能还要更新其他字段)
	参数  : [IN]  matchKey   : 流水号
	[IN]  confId		(必选)	: 会议ID
	[IN]  confTopic		(可选)	: 更新会议议题
	[IN]  appData       (可选)  : 应用自定义字符串

	返回值   : 0成功； 非0失败
	回调函数 ：void (*onUpdateHistoryConference)
	*******************************************************************************/
	EC_CALL_API int UpdateHistoryConference(unsigned int* matchKey, const char* confId, const char* confTopic, const char* appData);

    /*! @function
    ********************************************************************************
     函数名: GetConferenceInfo
     功能  : 获取会议信息
     参数  : [IN]  matchKey      : 流水号
             [IN]  confId        : (必选)会议ID
			 [IN]  jsonString    : 扩展字段 {"historyConf":"是否历史会议 0 当前 1 历史 2 同时查","appData":"备用，为空"}

	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGetConferenceInfo)
    *******************************************************************************/
    EC_CALL_API int GetConferenceInfo(unsigned int* matchKey, const char* confId, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: GetConferenceInfoList
	 功能  : 获取会议信息列表
	 参数  : [IN]  matchKey        : 流水号
			 [IN]  createTimeBegin : 搜索条件：会议创建时间起始点
			 [IN]  createTimeEnd   : 搜索条件：会议创建时间终点
			 [IN]  memberId        : 搜索条件：账号
			 [IN]  memberIdType    : memberId的类型，应用账号还是落地电话号码。1: 电话号码，2: 应用账号
			 [IN]  confType        : 会议类型。0：临时会议；1：永久会议。默认值：0
			 [IN]  searchByMember  : 搜索类型 1: 此用户创建的会议，2:此用户参与的 会议，3:此用户相关的会议(创建或 者参与)
			 [IN]  pageNo          : 按页返回，获取第几页的内容，-1不设置此字段。如果没有设置此字段，则返回所有符合条件的列表， 
			 [IN]  pageSize        : 按页返回，每页返回的会议个数，-1不设置此字段，有pageNo字段，此字段才起作用。如果没有设置，则使用默认值20
			 [IN]  reserveEnable   : 仅查询预约会议或非预约会议,没有这个参数,则返回所有类型的会议,详细描述参考 Conference/Create 接口
			 [IN]  stateInProcess  : 仅查询未开始的会议或进行中的会议，没有这个参数，则返回所有类型的会议 0: 返回未开始的会议 1: 返回进行中的会议
			 [IN]  mediaType	   :仅查询指定类型的会议 0：电话会议，1：多流视频，2：混屏视频，3：多流混屏的混合模式，4：实时对讲； 没有这个参数，则返回所有类型的会议
			 [IN]  keyword         :模糊搜索 confName
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	 返回值   : 0成功； 非0失败
	 回调函数 ：void (*onGetConferenceInfoList)
	 *******************************************************************************/
	EC_CALL_API int GetConferenceInfoList(unsigned int* matchKey, const char* createTimeBegin, const char* createTimeEnd, const char*memberId, int memberIdType, int confType, int searchByMember, int pageNo, int pageSize, int reserveEnable, int stateInProcess, int mediaType, const char* keyword, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: GetHistoryConferenceInfoList
     功能  : 获取历史会议信息列表
     参数  : [IN]  matchKey        : 流水号
             [IN]  createTimeBegin : 搜索条件：会议创建时间起始点
             [IN]  createTimeEnd   : 搜索条件：会议创建时间终点
			 [IN]  confType        : 会议类型。0：临时会议；1：永久会议。默认值：0
             [IN]  searchByMember  : 根据memberId, memberIdType两个字段进行获取会议列表，1: 用户创建的会议，2:用户参与的会议，3:用户相关的会议（创建或者参与）
             [IN]  pageNo          : 按页返回，获取第几页的内容，-1不设置此字段。如果没有设置此字段，则返回所有符合条件的列表， 
			 [IN]  pageSize        : 按页返回，每页返回的会议个数，-1不设置此字段，有pageNo字段，此字段才起作用。如果没有设置，则使用默认值20
			 [IN]  confId          : 会议id
			 [IN]  reserveEnable   : 仅查询预约会议或非预约会议,没有这个参数,则返回所有类型的会议,详细描述参考 Conference/Create 接口
			 [IN]  stateInProcess  :仅查询未开始的会议或进行中的会议，没有这个参数，则返回所有类型的会议 0: 返回未开始的会议 1: 返回进行中的会议
			 [IN]  mediaType	   :仅查询指定类型的会议 0：电话会议，1：多流视频，2：混屏视频，3：多流混屏的混合模式，4：实时对讲； 没有这个参数，则返回所有类型的会议
			 [IN]  keyword         :模糊搜索 confName
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGetHistoryConferenceInfoList)
    *******************************************************************************/
    EC_CALL_API int GetHistoryConferenceInfoList(unsigned int* matchKey, const char* createTimeBegin, const char* createTimeEnd,  int confType, int searchByMember, int pageNo, int pageSize, const char* confId, int reserveEnable, int stateInProcess, int mediaType, const char* keyword, const char* jsonString);
	
	/*! @function
	 ********************************************************************************
	 函数名: DelHistoryConferenceInfoList
	 功能  : 删除指定历史会议信息列表。
	 参数  : [IN]  matchKey     : 流水号
	 [IN]  confIdList      : 需要删除的会议号ID列表,此列表兼容两种形态，
							可以是单个会议号，如152540，也可以是json数组，json数组格式如下：
							{
								"confIdList":	["152540", "152541", "152542"]
							}
	 [IN]  MemberId		   : 用户id
	 [IN]  memberIdType    : 指memberId的类型，应用账号还是落地电话号码 1-电话号码，2-应用账号，

	 返回值   : 0成功； 非0失败
	 回调函数 ：void (*onDelHistoryConferenceInfoList)
	 *******************************************************************************/
	EC_CALL_API int DelHistoryConferenceInfoList(unsigned int* matchKey, const char* confIdList, const char* memberId, int memberIdType);
	
	/*! @function
    ********************************************************************************
     函数名: LockConference
     功能  : 锁定解锁定会议。锁定会议后，任何成员无法加入会议，会议信息中 state 字段标识 会议是否被锁定
     参数  : [IN]  matchkey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  action           : (必选)0:锁定 1:解锁 6:开启举手发言 7:禁止举手发言
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onLockConference)
    *******************************************************************************/
    EC_CALL_API int LockConference(unsigned int* matchKey, const char* confId,  int action, const char* jsonString);

	//成员管理接口
	/*! @function
    ********************************************************************************
     函数名: MemberJoinConference
     功能  : 用户加入会议
     参数  : [IN]  matchKey      : 流水号
			 [IN]  confId        : (必选)会议ID 注意：首字符为0表示是三方会议
             [IN]  password      : 会议密码
			 [IN]  userName      : 成员名称
             [IN]  inviter       : 如果此用户是被邀请加入的，需要带上邀请者的ID
			 [IN]  inviterIdType : 邀请者ID类型：1，电话号码；2，平台账户
             [IN]  appData       : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  mediaType	 : 0:落地电话会议 1:多路视频会议 2:混屏视频会议 3:多路+混屏视频会议
			 [IN]  roleId	     : 角色id。默认为普通成员3
			 [IN]  phoneNumber   : 关联电话，idType为应用账号时，才能有此字段。此时用户使用关联的电话参与会议
			 [IN]  joinState     : 成员入会时状态(是否打开语音或视频)，取值同获取会议成员信息接口返回的state值，默认打开语音和视频
			 [IN]  terminalUA    : 入会终端类型 （操作系统类型） iPhone Android Windows Mac Web
			 [IN]  jsonString    : 扩展字段(没用到可以不列出): {
										"deviceUserId":"string 小程序端入会时传此参数， 表示当前成员遥控的硬件成员 UserId",
										"masterUserId":"string 硬件端入会时传此参数， 表示遥控者的 UserId",
										"joinSource": "number 加入来源 0-输入会议号加入 1预约详情界面点击立即开始"
									}
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onMemberJoinConference)
    *******************************************************************************/
    EC_CALL_API int MemberJoinConference(unsigned int* matchKey, const char* confId, const char* password,const char*userName,const char* inviter, int inviterIdType, const char* appData, int mediaType, int roleId, const char* phoneNumber, int joinState, const char* terminalUA, const char* jsonString);

    /*! @function
    ********************************************************************************
     函数名: MemberQuitConference
     功能  : 成员退出会议
     参数  : [IN]  matchKey      : 流水号
             [IN]  confId        : (必选)会议ID
             [IN]  appData       : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  jsonString    : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onMemberQuitConference)
    *******************************************************************************/
    EC_CALL_API int MemberQuitConference(unsigned int* matchKey, const char* confId,  const char* appData, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: UpdateConferenceMember
	 功能  : 更新会议成员信息
	 参数  : [IN]  matchKey		 : 流水号
			 [IN]  confId        : (必选)会议ID
			 [IN]  memberId      : 需要更新的成员ID
			 [IN]  userName      : 成员名称
			 [IN]  idType        : memberId的类型，应用账号还是落地电话号码。1: 电话号码，2: 应用账号
			 [IN]  appData       : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  jsonString    : 备用扩展字段，暂不启用
			 [IN]  deviceType    : 设备类型，默认0, 不开启多终端
	 返回值   : 0成功； 非0失败
	 回调函数 ：void (*onUpdateConferenceMember)
	 *******************************************************************************/
	EC_CALL_API int UpdateConferenceMember(unsigned int* matchKey, const char* confId, const char* memberId,  const char*userName,int idType, const char* appData, const char*jsonString, int deviceType = 0);

	/*! @function
    ********************************************************************************
     函数名: GetConferenceMemberInfo
     功能  : 获取会议成员信息
     参数  : [IN]  matchKey      : 流水号
			 [IN]  confId        : (必选)会议ID
             [IN]  memberId      : 成员ID
             [IN]  idType        : memberId的类型，应用账号还是落地电话号码。1: 电话号码，2: 应用账号
			 [IN]  jsonString    : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGetConferenceMemberInfo)
    *******************************************************************************/
    EC_CALL_API int GetConferenceMemberInfo(unsigned int* matchKey, const char* confId, const char* memberId,  int idType, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: GetConferenceMemberInfoList
     功能  : 获取会议成员列表
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
             [IN]  pageNo          : 按页返回，获取第几页的内容。如果没有设置此字段，则返回所有符合条件的列表
			 [IN]  pageSize        : 按页返回，每页返回的成员个数，有pageNo字段，此字段才起作用。如果没有设置，则使用默认值30
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGetConferenceMemberInfoList)
    *******************************************************************************/
    EC_CALL_API int GetConferenceMemberInfoList(unsigned int* matchKey, const char* confId, int pageNo, int pageSize, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: GetHistoryConferenceMemberInfoList
     功能  : 获取某一历史会议成员列表
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  memberId        : 成员ID
             [IN]  memberIdType    : memberId的类型，应用账号还是落地电话号码。1: 落地电话号码，2: 应用账号
             [IN]  pageNo          : 按页返回，获取第几页的内容，-1不设置此字段。如果没有设置此字段，则返回所有符合条件的列表
			 [IN]  pageSize        : 按页返回，每页返回的成员个数，-1不设置此字段，有pageNo字段，此字段才起作用。如果没有设置，则使用默认值20
			 [IN]  jsonString      : 备用扩展字段，暂不启用
			 [IN]  returnDuplicate : 返回的数据是否包含重复成员 0:返回去除的结果，每个成员仅返回一条记录 1:返回所有成员，同一成员可能入会多次，结果包含重复
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGetHistoryConferenceMemberInfoList)
    *******************************************************************************/
    EC_CALL_API int GetHistoryConferenceMemberInfoList(unsigned int* matchKey, const char* confId, const char*memberId, int memberIdType, int pageNo, int pageSize, int returnDuplicate, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceInviteMember
     功能  : 邀请加入会议
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
             [IN]  inviteMembers   : (必选)邀请的会议成员列表，包含xml子节点： member成员ID: memberIdID类型: idType角色ID: roleId
			 [IN]  count           : 邀请成员的个数
			 [IN]  callImmediately : 是否立即发起呼叫 对于自定义账号，1表示给用户显示呼叫页面，并设置超时时间1分钟 对于电话号码（或关联电话）账号，1表示立即给cm发呼叫命令 0表示仅在会议中增加成员（一般用户预约会议开始前增加成员）
             [IN]  appData         : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  jsonString      : 备用扩展字段(没用到可以不列出): {
										"seqCall":"Number可选 -1代表默认 多端情况下是否同振铃,针对含有用户呼叫列表时有效, 0 顺振 1 同振"
									}
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceInviteMember)
    *******************************************************************************/
	EC_CALL_API int ConferenceInviteMember(unsigned int* matchKey, const char* confId, ECConfInviteMember* inviteMembers, int count, int callImmediately,const char* appData, const char* jsonString);
	
	/*! @function
	********************************************************************************
	函数名: ConferenceMemberAcceptInvitation
	功能  : 成员接受邀请加入会议
	参数  : [IN]  matchKey        : 流水号
	[IN]  confId          : (必选)会议ID
	[IN]  cause           : 邀请结果,可以自定义透传错误码
			107408 呼叫超时 （voip场景）
			107603 被叫拒接 （voip场景）
			107781 用户拒接 （落地呼叫场景）
			107775 无人接听 （落地呼叫场景）
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceMemberAcceptInvitation)
	*******************************************************************************/
	EC_CALL_API int ConferenceMemberAcceptInvitation(unsigned int* matchKey, const char* confId, const char* cause);

	/*! @function
    ********************************************************************************
     函数名: ConferenceMemberRejectInvitation
     功能  : 成员拒绝邀请加入会议
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
             [IN]  invitationId    : (必选)邀请通知的ID
			 [IN]  cause           : 邀请结果,可以自定义透传错误码
									 107408 呼叫超时 （voip场景）
									 107603 被叫拒接 （voip场景）
									 107781 用户拒接 （落地呼叫场景）
									 107775 无人接听 （落地呼叫场景）
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceMemberRejectInvitation)
    *******************************************************************************/
    EC_CALL_API int ConferenceMemberRejectInvitation(unsigned int* matchKey, const char* confId, const char* invitationId, const char* cause, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceKickoutMember
     功能  : 踢出会议成员
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
             [IN]  kickMembers     : (必选)踢出的会议成员。 包含xml子节点： member成员ID: memberIdID类型: idType
			 [IN]  count           : 踢出成员的个数
             [IN]  appData         : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceKickoutMember)
    *******************************************************************************/
    EC_CALL_API int ConferenceKickoutMember(unsigned int* matchKey, const char* confId, ECConfKickMember*kickMembers, int count, const char* appData, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: SetConferenceMemberRole
     功能  : 设置成员角色。
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  memberId        : 需要更新的成员ID
             [IN]  memberIdType    : memberId的类型，应用账号还是落地电话号码。1: 落地电话号码，2: 应用账号
			 [IN]  roleId          : 角色id。包括会议默认角色id和用户自定义角色id，会议默认的四个角色ID：0， 1. 创建者，2. 主持人，3.普通成员
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onSetConferenceMemberRole)
    *******************************************************************************/
    EC_CALL_API int SetConferenceMemberRole(unsigned int* matchKey, const char* confId, const char*memberId, int memberIdType, int roleId, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceSendCmd
     功能  : 透传REST接口
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
             [IN]  bAllMember      : (必选)是否作用于会议中的所有成员(自己除外) 0: 否，1: 是
			 [IN]  dstMembers	   : allMember=0时，需要此字段所控制的会议成员，可多个。内容包括： member成员ID: memberId；ID类型: memberIdType
			 [IN]  memberCount     : 操作的成员个数
			 [IN]  cmdData         : json格式，并且经过base64编码后的字符串.允许的最大长度为1024字节 (注意：cmdtype字段，10-打开全员签到，11-关闭全员签到)
			 [IN]  jsonString      : 扩展字段，可选传{"action":"10-打开全员签到，11-关闭全员签到"}
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceSendCmd)
    *******************************************************************************/
    EC_CALL_API int ConferenceSendCmd(unsigned int* matchKey, const char* confId, int bAllMember, ECConfMembers* dstMembers, int memberCount, const char* cmdData, const char* jsonString);

	//投屏
	/*! @function
	  ********************************************************************************
	  函数名: getConferenceDeviceFromCode
	  功能  : 根据投屏码获取设备.
	  参数  : [IN]  tcpMsgIdOut			 : 流水号
			  [IN]  screenCode	必选     : 投屏码

	  返回值   : 是否成功 0：成功； 非0失败
	  回调函数 ：void (*onGetConferenceDeviceFromCode)
	  *******************************************************************************/
	EC_CALL_API int GetConferenceDeviceFromCode(unsigned int* matchKey, const char* screenCode);

	//媒体控制接口
	/*! @function
    ********************************************************************************
     函数名: ConferenceMediaControl
     功能  : 会议媒体控制
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  unchangable     : 是否不可被目标成员更改，0：否，1：是
             [IN]  bAllMember      : (必选)是否作用于会议中的所有成员0: 否，1: 是
			 [IN]  members		   : allMember=0时，需要此字段所控制的会议成员，可多个内容包括：xml子节点： member成员ID: memberIdID类型: idType
			 [IN]  memberCount     : 要控制的会议成员个数
             [IN]  action          : (必选)枚举值如下
									必选禁止听 = 0
									允许听 = 1
									禁止说=2
									允许说=3

									禁止看摄像头视频 = 10
									允许看摄像头视频=11
									禁止发布摄像头视频=12
									允许发布摄像头视频=13

									禁止看共享的屏幕 = 20
									允许看共享的屏幕=21
									禁止发布屏幕共享=22
									允许发布屏幕共享=23

									禁止看共享的白板 = 30
									允许看共享的白板=31
									禁止发布白板共享=32
									允许发布白板共享=33
									禁止操作白板=34
									允许操作白板=35

									主持人点名=77
									主持人同意申请发言=78
									主持人拒绝申请发言=79

			 [IN]  appData         : json格式，并且经过base64编码后的字符串允许的最大长度为1024字节当应用设置了定制化需求时，请求被转发到云平台的应用服务器AS
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceMediaControl)
    *******************************************************************************/
    EC_CALL_API int ConferenceMediaControl(unsigned int* matchKey, const char* confId, int unchangable, int bAllMember, ECConfMembers* members, int memberCount, int action,const char* appData, const char* jsonString);

	/*! @function
	********************************************************************************
	函数名: setConferenceAutoVoiceControl
	功能  : 会议音频媒体是否sdk自动控制
	参数  :
	[IN]  bAutoVoiceControl          : 1 sdk收到会控通知会自动控制音频媒体 0 sdk不会控制媒体相关
	返回值   : 0 成功 1 失败
	回调函数 : 无
	*******************************************************************************/
	EC_CALL_API int SetConferenceAutoVoiceControl(bool bAutoVoiceControl);


	/*! @function
	********************************************************************************
	函数名: SetConferenceAutoMediaControl
	功能  : 会议媒体是否sdk自动控制
	参数  :
	[IN]  bAutoMediaControl          : 1 sdk收到会控通知会自动控制媒体 0 sdk不会控制媒体相关
	返回值   : 0 成功 1 失败
	回调函数 : 无
	*******************************************************************************/
	EC_CALL_API int SetConferenceAutoMediaControl(bool bAutoMediaControl);

	/*! @function
    ********************************************************************************
     函数名: ConferenceRecord
     功能  : 会议录制控制
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  members		   : 需要录制的人员list
			 [IN]  count           : 录制人员数量
             [IN]  action          : (必选)枚举值如下
									支持如下几种操作：
									开始录制语音 = 0
									停止录制语音 = 1

									开始录制摄像头视频 = 10
									停止录制摄像头视频 = 11

									开始录制共享的屏幕 = 20
									停止录制共享的屏幕 = 21
									
									开始录制白板 = 30
									停止录制白板 = 31
									
									开始录所有 = 40（发布音视频时，则只录制音视频;开启屏幕共享时，则录制屏幕共享）.
									停止录制所有 = 41
			[IN]  jsonString        : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceRecord)
    *******************************************************************************/
    EC_CALL_API int ConferenceRecord(unsigned int* matchKey, const char* confId, ECConferenceRecordMemberInfo *members, int count, int action, const char* jsonString);

	/*! @function
	********************************************************************************
	函数名: ConferenceRecordStart
	功能  : 开始会议录制
	参数  : [IN]  tcpMsgIdOut		: 流水号
	[IN]  confId		(必选)		: 会议ID
	[IN]  recordType:		录像文件类型列表 目前只支持flv,aac,h264,mp4,jpeg 示例： flv,aac,h264 参数表示同时录制 flv,h264 两个视频文件 和 aac 一个音频文件
	[IN]  outputPath:		录像文件输出路径输出格式: aaa/bbb/
	[IN]  outputFilename:	录像文件名，不带扩展名
	[IN]  layoutIdx:		布局 -1 自动 0 首成员个大屏显示，其他成员小屏显示，首个成员即 members 参数中第一个成员
	[IN]  resolutionIdx:	分辩率索引，分辨率与码率有固定值，根据不同索引，设置这些固定值
							0:320,180,15
							1:480,270,15"
							2:640,360,15
							3:960,540,15
							4:1280,720,15
	[IN]  model:			混屏切换模式: auto:自动布局 自动布局时，视频画面自动处理所有会议成员的布局，忽略 members 参数 并且开启屏幕共享时，视频画面会自动切换到屏幕共享
										  manual:手动布局 手动布局时，视频画面仅显示指定成员的视频， members 是必选参数
	[IN]  members:			所控制的会议成员 内容包括：{ 成员ID: memberId String	ID类型: idType Number 媒体源类型： srcType Number 1:代表摄像头视频 2:代表共享视频，不带类型为成员视频 }
	[IN]  rtmpPushUrl:		直播推流地址，将录像直播到该地址

	回调函数 ：void (*onConferenceRecordStart)
	*******************************************************************************/
	EC_CALL_API int ConferenceRecordStart(unsigned int* matchKey, const char* confId, const char* recordType, const char* outputPath, const char* outputFilename, const char* layoutIdx, const char* resolutionIdx, const char* model, const char* members, const char* rtmpPushUrl);

	/*! @function
	********************************************************************************
	函数名: ConferenceRecordPause
	功能  : 暂停会议录制
	参数  : [IN]  tcpMsgIdOut		: 流水号
	[IN]  confId		(必选)		: 会议ID
	[IN]  sessionId   (必选)		: 录制会话ID

	回调函数 ：void (*onConferenceRecordPause)
	*******************************************************************************/
	EC_CALL_API int ConferenceRecordPause(unsigned int* matchKey, const char* confId, const char *sessionId);

	/*! @function
	********************************************************************************
	函数名: ConferenceRecordResume
	功能  : 恢复会议录制
	参数  : [IN]  tcpMsgIdOut		: 流水号
	[IN]  confId		(必选)		: 会议ID
	[IN]  sessionId   (必选)		: 录制会话ID

	回调函数 ：void (*onConferenceRecordResume)
	*******************************************************************************/
	EC_CALL_API int ConferenceRecordResume(unsigned int* matchKey, const char* confId, const char *sessionId);

	/*! @function
	********************************************************************************
	函数名: ConferenceRecordStop
	功能  : 停止会议录制
	参数  : [IN]  tcpMsgIdOut		: 流水号
	[IN]  confId		(必选)		: 会议ID
	[IN]  sessionId   (必选)		: 录制会话ID

	回调函数 ：void (*onConferenceRecordStop)
	*******************************************************************************/
	EC_CALL_API int ConferenceRecordStop(unsigned int* matchKey, const char* confId, const char *sessionId);

	/*! @function
	********************************************************************************
	函数名: getConferenceRecordList
	功能  : 获取会议录制文件列表
	参数  : [IN]  matchKey        : 流水号
			[IN]  confId		(必选)		: 会议ID
			[IN]  historyConf   (必选)		: 指明当前会议类型 0:当前会议 1:历史会议
			[IN]  pageNo		(可选)		: 按页返回，获取第几页的内容 默认为0，0为第一页
			[IN]  pageSize      (可选)		: 按页返回，每页返回的表示个数，如果有pageNo字段，此字段才起作用，默认值20，最大值20

	回调函数 ：void (*onGetConferenceRecordList)
	*******************************************************************************/
	EC_CALL_API int GetConferenceRecordList(unsigned int* matchKey, const char* confId, int historyConf, int pageNo, int pageSize);
	
	/*! @function
	********************************************************************************
	函数名: getConferenceRecordSessions
	功能  : 获取会议录制文件列表
	参数  : [IN]  matchKey        : 流水号
			[IN]  confId		(必选)		: 会议ID
			[IN]  sessionId     (必选)		: 录制会话ID.值若为"all":返回所有会议会话信息.

	回调函数 ：void (*onGetConferenceRecordSessions)
	*******************************************************************************/
	EC_CALL_API int GetConferenceRecordSessions(unsigned int* matchKey, const char* confId, const char* sessionId);

	/*! @function
	********************************************************************************
	函数名: ConferenceAudioPlay
	功能  : 会议放音控制
	参数  : [IN]  matchKey        : 流水号
			[IN]  confId          : (必选)会议ID
			[IN]  fileUrl         : 用于会议放音，放音文件
			[IN]  action          : (必选)枚举值如下
									支持如下几种操作：
									开始会议放音 = 0
									停止会议放音 = 1
			[IN]  loop         : (必选)循环次数，-1无限循环
			[IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceAudioPlay)
	*******************************************************************************/
	EC_CALL_API int ConferenceAudioPlay(unsigned int* matchKey, const char* confId, const char* fileUrl, int action, int loop, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceStartPublishVideo
     功能  : 发布视频
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceStartPublishVideo)
    *******************************************************************************/
    EC_CALL_API int ConferenceStartPublishVideo(unsigned int* matchKey, const char* confId, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceStopPublishVideo
     功能  : 停止发布视频
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceStopPublishVideo)
    *******************************************************************************/
    EC_CALL_API int ConferenceStopPublishVideo(unsigned int* matchKey, const char* confId, const char* jsonString);
    
    /** add by keven 2019.8.5
     功能  : 延长会议时间
     参数  : [IN]  tcpMsgIdOut     : 流水号
     [IN]  confId          : (必选)会议ID
     [IN]  tryMinDuration     : 可选 延长的最少时间，单位：分钟 如果无法延长到该最少时间，更新失败
     [IN]  tryMaxDuration     : 可选 延长的最大时间，单位：分钟 如果能满足延长至该最大时间，会议将延长该最大时间。如果不能满足延长该值，服务器延长至可延长的最大时间
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onConferenceExtendDuration)
     */
     EC_CALL_API int ConferenceExtendDuration(unsigned int* matchKey, const char* confId,int tryMinDuration, int tryMaxDuration);
    
    /** add by keven 2019.8.27
     功能  : 会议通用接口
     参数  : [IN]  tcpMsgIdOut     : 流水号
     [IN]  path          : 接口地址
     [IN]  jsonString          : jsonString
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onConferenceCommon)
     */
    EC_CALL_API int  ConferenceCommon(unsigned int* matchKey,const char* path,const char* jsonString);
    

	/*! @function
	********************************************************************************
	函数名: StartWhiteboardSharing
	功能  : 开始白板共享
	参数  : [IN]  matchKey        : 流水号
	[IN]  confId          : (必选)会议ID
	[IN]  wbInfo      : 白板信息
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onStartWhiteboardSharing)
	*******************************************************************************/
	EC_CALL_API int StartWhiteboardSharing(unsigned int* matchKey, const char* confId, const char* wbInfo);

	/*! @function
	********************************************************************************
	函数名: StopWhiteboardSharing
	功能  : 停止白板共享
	参数  : [IN]  matchKey        : 流水号
	[IN]  confId          : (必选)会议ID
	[IN]  wbInfo      : 白板信息
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onStopWhiteboardSharing)
	*******************************************************************************/
	EC_CALL_API int StopWhiteboardSharing(unsigned int* matchKey, const char* confId, const char* wbInfo);

	/*! @function
    ********************************************************************************
     函数名: ConferenceStartScreenSharing
     功能  : 开始共享桌面
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  jsonString      : 扩展字段, 可选传{"shareType":"Number 0-共享桌面；1-共享应用"}

	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceStartScreenSharing)
    *******************************************************************************/
    EC_CALL_API int ConferenceStartScreenSharing(unsigned int* matchKey, const char* confId, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceStartPublishVideo
     功能  : 停止共享桌面
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceStopScreenSharing)
    *******************************************************************************/
    EC_CALL_API int ConferenceStopScreenSharing(unsigned int* matchKey, const char* confId, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: ConferenceStartPublishVoice
     功能  : 发布音频
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  exclusively     : 仅用于实时对讲功能。
									 1 表示控麦，此时仅允许会中有一个人发布语音，如果已经有人发布语音，此接口调用会返回错误
									 0 表示发布语音，不考虑其他人语音发布状态
									 2 申请发言
									 3 同意点名
									 4 拒绝点名
			 默认为0
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceStartPublishVoice)
    *******************************************************************************/
    EC_CALL_API int ConferenceStartPublishVoice(unsigned int* matchKey, const char* confId, int exclusively, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceStopPublishVoice
     功能  : 停止发布音频
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  exclusively     : 仅用于实时对讲功能。
									 1 表示控麦，此时仅允许会中有一个人发布语音，如果已经有人发布语音，此接口调用会返回错误
									 0 表示关闭发布语音

			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceStopPublishVoice)
    *******************************************************************************/
    EC_CALL_API int ConferenceStopPublishVoice(unsigned int* matchKey, const char* confId, int exclusively, const char* jsonString);
	
	//多路会议申请视频源接口
	/*! @function
     ********************************************************************************
     函数名   : ConferenceRequestMemberVideo
     功能     : 多路视频会议中请求某一远端视频
     参数     : [IN]  confId	         : 所在会议号.
                [IN]  confPasswd         : 所在会议密码.可选
                [IN]  member             : 请求远端成员.
				[IN]  view               : 当成功请求时，展示该成员的窗口.
				[IN]  mediaSourceType    : 媒体类型。enum {
															CCP_CONF_MEDIA_TYPE_VIDEO=1,//视频
															CCP_CONF_MEDIA_TYPE_SHARE=2,//共享
														};
				[IN]  width              : 窗口宽
				[IN]  height             : 窗口高
				[IN]  jsonString         : 备用扩展字段，暂不启用
	 			[IN]  deviceType    	 : 设备类型，默认0

     返回值   : 0成功； 非0失败
     回调函数 ：void (*onConferenceRequestMemberVideo)(int reason,const char *confId,const char *member,int mediaSourceType);
	 *******************************************************************************/
 	 EC_CALL_API int ConferenceRequestMemberVideo(const char *confId, const char *confPasswd, const char *member, void *view, int mediaSourceType, int width, int height, const char*jsonString, int deviceType = 0);

    /*! @function
     ********************************************************************************
     函数名   : ConferenceCancelMemberVideo
     功能     : 多路视频会议中停止某一远端视频
     参数     : [IN]  confId	         :  所在会议号.
                [IN]  confPasswd         : 所在会议密码.可选
                [IN]  member             :  请求远端成员.
                [IN]  mediaSourceType    :  媒体类型。enum {
															CCP_CONF_MEDIA_TYPE_VIDEO=1,//视频
															CCP_CONF_MEDIA_TYPE_SHARE=2,//共享
														};
				[IN]  jsonString         : 备用扩展字段，暂不启用
	 			[IN]  deviceType    	 : 设备类型，默认0
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onConferenceCancelMemberVideo)(int reason,const char *confId, const char *member,int mediaSourceType, void *view);
	 *******************************************************************************/
	 EC_CALL_API int ConferenceCancelMemberVideo(const char *confId, const char *confPasswd, const char *member, int mediaSourceType, const char*jsonString, int deviceType = 0);
 
    /*! @function
     ********************************************************************************
     函数名   : ConferenceResetMemberView
     功能     : 多路视频会议中重置窗体
     参数     : [IN]  confId	        : 所在会议号.
                [IN]  member            : 请求远端成员.
				[IN]  view              : 展示该成员的窗口.
				[IN]  mediaSourceType   : 媒体类型。enum {
														CCP_CONF_MEDIA_TYPE_VIDEO=1,//视频
														CCP_CONF_MEDIA_TYPE_SHARE=2,//共享
														};
				[IN]  width             : 窗口宽
				[IN]  height            : 窗口高
                [IN]  view              : 展示该成员的窗口.
				[IN]  jsonString        : 备用扩展字段，暂不启用
				[IN]  deviceType    	: 设备类型，默认0
     返回值   : 0成功； 非0失败
     *******************************************************************************/
     EC_CALL_API int ConferenceResetMemberView(const char *confId,const char *member, void *view, int mediaSourceType, int width, int height, const char*jsonString, int deviceType = 0);
	 	
	/*! @function
    ********************************************************************************
     函数名: ConferenceGetAppSetting
     功能  : 获取应用下的总的会议设置信息
     参数  : [IN]  matchkey          : 流水号
			 [IN]  jsonString        : 备用扩展字段，暂不启用
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onConferenceGetAppSetting)
    *******************************************************************************/
    EC_CALL_API int ConferenceGetAppSetting(unsigned int* matchKey, const char* jsonString);

	/*! @function
	********************************************************************************
	函数名: SetConferenceParticipantCallbackTimeInterVal
	功能  : 设置声音最大最小参会成员显示的时间间隔
	参数  : [IN]  timeInterVal   : 时间间隔，单位为秒

	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int SetConferenceParticipantCallbackTimeInterVal(int timeInterVal);

	/*! @function
	********************************************************************************
	函数名: setConferenceCallType
	功能  : 设置会议呼叫类型，比如采用思科双流还是POLYCOM双流呼叫,目前传递6或者是7，其他暂时不支持
	参数  : [IN]  confCallType   : 呼叫类型

	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int SetConferenceCallType(int confCallType);
	
	/*! @function
	********************************************************************************
	 函数名: GetConferenceSummaryList
	功能  : 获取会议纪要列表
	参数  :
	[IN]  tcpMsgIdOut  必选    : 流水号
	[IN]  confId       必选    : 呼叫类型
	[IN]  pageNo       必选    : 按页返回，获取第几页的内容 默认为0，0为第一页
	[IN]  pageSize     必选    : 按页返回，每页返回的数据个数，有pageNo字段，此字段才起作用 默认值20000，最大值20000

	回调函数 ：onGetConferenceSummaryList
	*******************************************************************************/
	EC_CALL_API int GetConferenceSummaryList(unsigned int* matchKey, const char* confId, int pageNo, int pageSize);

	/*! @function
	************************************************************************
		函数名 : GetLocalVideoSnapshotByConfId
		功能 : 本地快照。
		参数 : [IN] ConfId : 当前会议id.
		[IN] fileName : 快照文件保存的全路径，含后缀名.jpg
		[OUT]  buf	      : 图像内存指针
		[OUT]  size	      : 图像内存大小
		[OUT]  width	  : 图像宽
		[OUT]  height	  : 图像高
		返回值 : 是否成功 0：成功； 非0失败
    ***********************************************************************/
	EC_CALL_API int GetLocalVideoSnapshotByConfId(const char* confId, const char* fileName);
	EC_CALL_API int GetLocalVideoSnapshotExByConfId(const char* confId, unsigned char **buf, unsigned int *size, unsigned int *width, unsigned int *height);

	/** 
   函数名   : getRemoteVideoSnapshotByConfId
   功能     : 会议远端快照。
   参数     : [IN]  confId      : 当前会议id
			  [IN]  fileName      : 快照文件保存的全路径，含后缀名.jpg
			  [OUT]  buf          : 图像内存指针
			  [OUT]  size          : 图像内存大小
			  [OUT]  width      : 图像宽
			  [OUT]  height      : 图像高
   返回值   : 是否成功 0：成功； 非0失败
   *******************************************************************************/
	EC_CALL_API int GetRemoteVideoSnapshotByConfId(const char* confId, const char* fileName);
	EC_CALL_API int GetRemoteVideoSnapshotExByConfId(const char* confId, unsigned char **buf, unsigned int *size, unsigned int *width, unsigned int *height);

	/*! @function
  ********************************************************************************
  函数名   : SetVideoCodecManualMode
  功能     : 控制媒体库的视频码率是用手动模式还是自动调节模式，默认是自动模式（manualMode是false),如果调用，需要在建立视频通话前
  参数     :  [IN] manualMode :  true：自动；false:手动 ,默认false
  返回值   :  无
  ***************************************************************************/
	EC_CALL_API void  SetVideoCodecManualMode(bool manualMode);

	/*! @function
	********************************************************************************
	函数名   : startServerRecord
	功能     : 开启服务器录像
	参数     : 
				  [IN]callid 会话ID
				  [IN]fileName 录像文件名称
	              [IN] filePath 录像服务器地址
	              [IN]resolution 录像分辨率 720p或1080p
	              [IN]source 录制源，0录制双方、1主叫、2被叫
				  [IN]isMix 是否混屏
				  [IN]url 录制回调URL
	返回值   :  是否成功 0：成功； 非0失败
	***************************************************************************/
	EC_CALL_API int  startServerRecord(const char*callid, const char*fileName, const char*filePath, const char*resolution,int source,bool isMix, const char*url);

	 //白板交互接口

	 /*! @function
    ********************************************************************************
     函数名: SetWhiteboardDataPath
     功能  : 设置白板中间数据存储目录
     参数  : [IN]  dataPath           : 目录。此目录要求固定，目录内有文件创建，删除，写，读等权限
			 [IN]  jsonString         : 备用扩展字段，暂不启用
	 返回值   : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int SetWhiteboardDataPath(const char* dataPath, const char* jsonString); 

	 //异步融合函数	

	 /*! @function
    ********************************************************************************
     函数名: ConferenceOpenWhiteboard
     功能  : 会议打开白板
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceOpenWhiteboard)
    *******************************************************************************/
    EC_CALL_API int ConferenceOpenWhiteboard(unsigned int* matchKey, const char* confId, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: ConferenceCloseWhiteboard
     功能  : 会议关闭白板
     参数  : [IN]  matchKey        : 流水号
             [IN]  confId          : (必选)会议ID
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onConferenceCloseWhiteboard)
    *******************************************************************************/
	EC_CALL_API int ConferenceCloseWhiteboard(unsigned int* matchKey, const char* confId, const char* jsonString);

	//异步透传
	 /*! @function
    ********************************************************************************
     函数名: ClearWhiteboardCurrentPage
     功能  : 清除当前页的画线
     参数  : [IN]  matchKey        : 流水号
             [IN]  userId          : 如果为NULL，则清除当前页的所有画线，否则只清除此用户的画线
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onClearWhiteboardCurrentPage)
    *******************************************************************************/
	EC_CALL_API int ClearWhiteboardCurrentPage(unsigned int* matchKey, const char* userId, const char* jsonString);
	
	 /*! @function
    ********************************************************************************
     函数名: GotoWhiteboardPage
     功能  : 翻到某一页
     参数  : [IN]  matchKey        : 流水号
             [IN]  dstPageIndex    : (必选)目标页码
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGotoWhiteboardPage)
    *******************************************************************************/
	EC_CALL_API int GotoWhiteboardPage(unsigned int* matchKey, int dstPageIndex, const char* jsonString);
	
	 /*! @function
    ********************************************************************************
     函数名: GotoWhiteboardNextPage
     功能  : 翻到下一页
     参数  : [IN]  matchKey      : 流水号
			 [IN]  jsonString    : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGotoWhiteboardPage)
    *******************************************************************************/
	EC_CALL_API int GotoWhiteboardNextPage(unsigned int* matchKey, const char* jsonString);
	
	 /*! @function
    ********************************************************************************
     函数名: GotoWhiteboardPrevPage
     功能  : 翻到前一页
     参数  : [IN]  matchKey      : 流水号
			 [IN]  jsonString    : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onGotoWhiteboardPage)
    *******************************************************************************/
	EC_CALL_API int GotoWhiteboardPrevPage(unsigned int* matchKey, const char* jsonString);
	
	 /*! @function
    ********************************************************************************
     函数名: DrawUndoWhiteboard
     功能  : 撤销
     参数  : [IN]  matchKey     : 流水号
			 [IN]  type			: (必选)撤销类型(0 自己; 1 全部)
			 [IN]  jsonString    : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onDrawUndoWhiteboard)
    *******************************************************************************/
	EC_CALL_API int DrawUndoWhiteboard(unsigned int* matchKey, int type, const char* jsonString); 
	
	 /*! @function
    ********************************************************************************
     函数名: DrawRedoWhiteboard
     功能  : 恢复
     参数  : [IN]  matchKey       : 流水号
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onDrawRedoWhiteboard)
    *******************************************************************************/
	EC_CALL_API int DrawRedoWhiteboard(unsigned int* matchKey, const char* jsonString); 
	
	//同步函数
	/*! @function
    ********************************************************************************
     函数名: SetWhiteboardLineShape
     功能  : 设置线的形状
     参数  : [IN]  shape  : 形状
				typedef enum _CCP_shape_type {
				CCP_TYPE_NONE = 0,
				CCP_TYPE_FREE = 1,
				CCP_TYPE_LINE = 2,
				CCP_TYPE_ANGLE = 3,
				CCP_TYPE_TRIANGLE = 4,
				CCP_TYPE_CIRCLE	= 5,
				CCP_TYPE_ELLIPSE = 6,
				CCP_TYPE_DASH_LINE = 7,
				CCP_TYPE_ARROW_MARK = 8,
				CCP_TYPE_ARROW_MARK1 = 9,
				CCP_TYPE_TEXTURE = 10,
				CCP_TYPE_SHAPE_END
			} CCP_ShapeType;
			[IN]  jsonString     : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int SetWhiteboardLineShape(int shape, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: SetWhiteboardLineColor
     功能  : 设置线的颜色
     参数  : [IN]  shape  : 形状
			 [IN]  R 红 范围[0-255]
			 [IN]  G 绿 范围[0-255]
		     [IN]  B 蓝 范围[0-255]
		     [IN]  ALPHA 透明度 范围[0-255]
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int SetWhiteboardLineColor(int R, int G, int B, int ALPHA, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: SetWhiteboardLineWidth
     功能  : 设置线的宽度
     参数  : [IN]  size           : 形状[1-30]
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值 : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int SetWhiteboardLineWidth(int size, const char* jsonString); 
	
	/*! @function
    ********************************************************************************
     函数名: GetWhiteboardEraser
     功能  : 获取橡皮擦 注:目前只可以在白板上使用
     参数  : [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值 : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int GetWhiteboardEraser(const char* jsonString); 
	
	/*! @function
    ********************************************************************************
     函数名: GetWhiteboardPen
     功能  : 获取笔
     参数  : [IN]  penType        : 画笔类型。PEN_NORMAL=0,
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值 : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int GetWhiteboardPen(int penType, const char* jsonString);
		
	/*! @function
    ********************************************************************************
     函数名: BindWhiteboardWindows
     功能  : 绑定窗口（封装了渲染初始化），所有绘制都由底层处理
     参数  : [IN]  handle         ：窗口句柄
			 [IN]  x              ：窗口绘制起始位置，一般为0
			 [IN]  y              ：窗口绘制起始位置，一般为0
			 [IN]  width          ：渲染窗口宽
			 [IN]  height         ：渲染窗口高
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值 : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int BindWhiteboardWindows(void* handle, int x, int y,int width, int height, const char* jsonString);
	
	/*! @function
    ********************************************************************************
     函数名: HandleWhiteboardWindowsProc
     功能  : 窗口处理消息过程
     参数  : [IN]  hWnd           ：窗口句柄
			 [IN]  uMsg           ：窗口消息类型
			 [IN]  wParam         ：消息参数
			 [IN]  lParam         ：消息参数
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值 : 0成功； 非0失败
    *******************************************************************************/
    EC_CALL_API int HandleWhiteboardWindowsProc(void* hWnd, unsigned int uMsg, unsigned int wParam,unsigned long lParam, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: AutoShareDoc
     功能  : 自动文档共享.底层将融上传，转换，下载，共享自动切换问文档模式等多个操作于一身，方便用户调用
     参数  : [IN]  matchKey        : 流水号
             [IN]  fileName        : 文件全路径
			 [IN]  fileType        : 支持的类型。目前只支持UPLOAD_FILE_DOC = 1
			 [IN]  uuid            ：全局唯一id，用于服务器匹配文件。
			 [IN]  extOpts         ：扩展字段。
			 [IN]  jsonString      : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onAutoShareDoc)
    *******************************************************************************/
	EC_CALL_API int ECAutoShareDoc(unsigned int* matchKey, const char* fileName, int fileType, const char* uuid, const char* extOpts, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: SetDocBackgroundColor
     功能  : 设置文档的背景颜色。默认为黑色
     参数  : [IN]  R              ：红 范围[0-255]
             [IN]  G              ：绿 范围[0-255]
			 [IN]  B              ：蓝 范围[0-255]
			 [IN]  ALPHA          ：透明度 范围[0-255]
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
    *******************************************************************************/
	EC_CALL_API int SetDocBackgroundColor(int R, int G, int B, int ALPHA, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名: SwitchWhiteboardOrDoc
     功能  : 切换白板或者文档
     参数  : [IN]  matchKey       : 流水号
             [IN]  docId          : 文档id。为0表示白板，其他表示具体的文档
			 [IN]  jsonString     : 备用扩展字段，暂不启用
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onSwitchWhiteboardOrDoc)
    *******************************************************************************/
	EC_CALL_API int SwitchWhiteboardOrDoc(unsigned int* matchKey, int docId, const char* jsonString);

#ifdef WIN32
	#include <windows.h>
	/*! @function
	********************************************************************************
	函数名: SetScreenViewInfo
	功能  : 设置实际共享宽和高的view信息
	参数  :
	[IN]  fromX			  : 实际共享的起始位置x（相对左上角）
	[IN]  fromY			  : 实际共享的起始位置y（相对左上角）
	[IN]  viewWidth       : 实际共享的宽
	[IN]  viewHeight      : 实际共享的高
	返回值   : 0成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int SetScreenViewInfo(int fromX, int fromY, int viewWidth, int viewHeight);

	/*! @function
	********************************************************************************
	函数名: HandleCaptureRcMessageProc
	功能  : 处理windows共享窗口消息(窗口处理过程函数)
	参数  : 
	[IN]  hWnd       : 窗口句柄
	[IN]  UINT       : 消息类型
	[IN]  wParam     : 消息事件参数
	[IN]  lParam     : 消息事件参数
	返回值   : 0成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int HandleCaptureRcMessageProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam);

	/*! @function
	********************************************************************************
	函数名: HardwareSignalRequest
	功能  : 硬件信令请求
	参数  :
	[IN]  matchKey     : 流水号
	[IN]  requestJson  : 请求的JSON串
	返回值   : 0成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int HardwareSignalRequest(unsigned int* matchKey, const char* requestJson);
    
	/*! @function
	********************************************************************************
	函数名: Set_View_Render_Gdi

	[IN]  isGdi        必选     : GDI或directx绘图模式
	返回值   : 现在无明确意义
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int Set_View_Render_Gdi(bool isGdi);

	/*! @function
	********************************************************************************
	函数名: Set_View_Render_Mode

	[IN]  isLocal      必选   本地或远端SSRC
	[IN]  render_mode  必选	  0为剪切模式，1为全屏幕模式
	[IN]  mirror_mode  必选   镜像模式(true: 图像中文字翻转; false: 图像中文正常)
	*******************************************************************************/
	EC_CALL_API void Set_View_Render_Mode(bool isLocal, int renderMode, bool mirrorMode);

#endif

	/*! @function
	********************************************************************************
	函数名: Start_Share_Local_Sound
	功能  : 共享屏幕时打开本地声音
	参数  :
	返回值   : 0成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int Start_Share_Local_Sound();

	/*! @function
	********************************************************************************
	函数名: Stop_Share_Local_Sound
	功能  : 共享屏幕时关闭本地声音
	参数  :
	返回值   : 0成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int Stop_Share_Local_Sound();

#ifdef __cplusplus
}
#endif

#endif// _EC_CONF_MEETING_INTERFACE_H
