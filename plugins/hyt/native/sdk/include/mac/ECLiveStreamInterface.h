#ifndef _EC_LIVESTREAM_INTERFACE_H
#define _EC_LIVESTREAM_INTERFACE_H

#include "ECLiveStreamStructDef.h"
#ifdef __cplusplus
extern "C" 
{
#endif

//////////////////////////////////////////////////回调函数接口///////////////////////////////////////////////////////////
//回调设置接口，必须在主调前调用

//////////////////////////////////////////////////主调函数接口///////////////////////////////////////////////////////////
	/* 直播
	观看直播调用过程：
	void *handle =NULL
	createLiveStream(&handle);
	setLiveStreamViewer(handle,view);
	playLiveStream(handle, "http://livestream.com", back);
	..
	stopLiveStream(handle);
	releaseLiveStream(handle);
	handle = NULL;

	直播推流调用过程：
	void *handle =NULL
	createLiveStream(&handle);
	pushLiveStream(handle, "http://livestream.com", back);
	..
	stopLiveStream(handl);
	releaseLiveStream(handle);
	handle = NULL;
	*/
	 /*! @function
	 ********************************************************************************
	 函数名   : CreateLiveStream
	 功能     : 创建直播模块
	 参数     : [IN]  handle  : 创建的句柄
	 返回值   : 0成功；非0失败
	 *******************************************************************************/
	 EC_CALL_API int CreateLiveStream(void **handle);

	 /*! @function
	 ********************************************************************************
	 函数名   : PlayLiveStream
	 功能     : 开始观看直播
	 参数     : [IN]  handle		： 句柄
				[IN]  url			: 直播地址
	 返回值   : 返回值 0：成功  -1：初始化资源失败 -2：已经在直播或推流  -3：连接失败  -4：建立流失败
	 回调     ：onEcLiveStreamNetworkStatus
	 *********************************************************************************/
	 EC_CALL_API int PlayLiveStream(void *handle, const char * url, onEcLiveStreamNetworkStatus callBack);

	 /*! @function
	 ********************************************************************************
	 函数名   : PushLiveStream
	 功能     : 开始直播推流
	 参数     : [IN]  handle		： 句柄
				[IN]  url			: 推流地址
	 返回值   : 返回值 0：成功　-1：初始化资源失败 -2：已经在直播或者推流  -3：连接失败  -4：建立流失败
	 回调     ：onEcLiveStreamNetworkStatus
	 *********************************************************************************/
	 EC_CALL_API int PushLiveStream(void *handle, const char * url, onEcLiveStreamNetworkStatus callBack);

	 /*! @function
	 ********************************************************************************
	 函数名   : StopLiveStream
	 功能     : 停止观看或推流
	 参数     :	[IN]  handle		： 句柄
	 返回值   : 0成功；非0失败
	 *********************************************************************************/
	 EC_CALL_API int StopLiveStream(void *handle);

	 /*! @function
	 ********************************************************************************
	 函数名   : ReleaseLiveStream
	 功能     : 释放直播模块
	 参数     :	[IN]  handle		： 句柄
	 返回值   : 0成功；非0失败
	 *********************************************************************************/
	 EC_CALL_API int ReleaseLiveStream(void *handle);

	 /*! @function
	 ********************************************************************************
	 函数名   : SetLiveStreamViewer
	 功能     : 设置视频渲染窗口
	 参数     : [IN]  handle：句柄
				[IN]  view	：视频渲染窗口
	 返回值   : 返回值 0：成功　-1：参数不正确
	 *********************************************************************************/
	 EC_CALL_API int  SetLiveStreamViewer(void *handle, void *view);

	 /*! @function
	 ********************************************************************************
	 函数名   : SetLiveStreamConfig
	 功能     : 设置推流视频参数
	 参数     : [IN]  handle		 ： 句柄
				[IN]  fps            : 最大帧
				[IN]  cameraIndex	 : 摄像头index
				[IN]  autoBitrate    : 自动调整码率
				[IN]  resolution     : 视频分辨率，参考EC_LiveStreamResolution。当autoBitrate为true时自动调整分辨率
				[IN]  frmaeDegree    : 旋转角度.只支持角度 0,90,180,270
	 返回值   : 返回值 0：成功　-1：参数不正确
	 *********************************************************************************/
	 EC_CALL_API int  SetLiveStreamConfig(void *handle, int fps, int cameraIndex, bool autoBitrate, int resolution, int frmaeDegree);

	 /*! @function
	 ********************************************************************************
	 函数名   : SwitchLiveStreamCamera
	 功能     : 推流时切换摄像头
	 参数     : [IN]  handle		 ：句柄
				[IN]  cameraIndex	 : 摄像头index
	 返回值   : 返回值 0：成功　-1：参数不正确
	 *********************************************************************************/
	 EC_CALL_API int  SwitchLiveStreamCamera(void *handle, int cameraIndex);

	 /*! @function
	 ********************************************************************************
	 函数名   : setLiveVideoFrameDegree
	 功能     : 旋转推流画面角度
	 参数     : [IN]  handle ： 句柄
	 [IN]  degree : 旋转角度.只支持角度 0,90,180,270,
	 返回值   : 返回值 0：成功　-1：参数不正确
	 *********************************************************************************/
	 EC_CALL_API int SetLiveVideoFrameDegree(void *handle, int degree);

	 /*! @function
     ********************************************************************************
     函数名   : SelectLiveStreamShareWindow
     功能     : 设置推流视频参数
     参数     : [IN]  handle		 ： 句柄
				[IN] type : 共享设备类行 0 screen; 1 windows
				[IN]  windowid: 共享设备id
     返回值   : 返回值 0：成功　-1：参数不正确
     *********************************************************************************/
	// EC_CALL_API int SelectLiveStreamShareWindow(void *handle, int type, int windowid);
    
    /*! @function
     ********************************************************************************
     函数名   : SetLiveStreamVideoSource
     功能     : 设置推流视频参数
     参数     : [IN]  handle		 ： 句柄
				[IN]  videoSource	 : 视频来源 0 摄像头 1 是桌面
     返回值   : 返回值 0：成功　-1：参数不正确
     *********************************************************************************/
	 //EC_CALL_API int SetLiveStreamVideoSource(void *handle, int videoSource);

	 /*! @function
	 ********************************************************************************
	 函数名   : SetLiveStreamBeauty
	 功能     : 设置推流美颜。
	 参数     : [IN]  handle	： 句柄
	 [IN]  enable	:  是否开启美颜。 true开始美颜， false停止美颜
	 返回值   : 返回值 0：成功　-1：参数不正确
	 *********************************************************************************/
	// EC_CALL_API int SetLiveStreamBeauty(void *handle, bool enable);

#ifdef __cplusplus
}
#endif

#endif