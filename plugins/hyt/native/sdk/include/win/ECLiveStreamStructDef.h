#ifndef _EC_LIVESTREAM_STRUCT_DEFINE_H
#define _EC_LIVESTREAM_STRUCT_DEFINE_H

#include "ECStructDef.h"
typedef enum {
	EC_LIVESTREAM_RESOLUTION_720P =0,//         1280*720    bitrate = 1280
	EC_LIVESTREAM_RESOLUTION_HD  = 1,//         960*540     bitrate = 1024                
	EC_LIVESTREAM_RESOLUTION_QHD = 2,//         640X360     bitrate = 768       
	EC_LIVESTREAM_RESOLUTION_SD  = 3,//标清。    640X360     bitrate = 512;   
	EC_LIVESTREAM_RESOLUTION_LOW = 4 //低清。    640X360     bitrate = 384;     
} EC_LiveStreamResolution;
typedef enum  {
	EC_LIVESTREAM_CONNECTING      = 0,//连接中
	EC_LIVESTREAM_CONNECT_SUCCESS = 1,
	EC_LIVESTREAM_CONNECT_FAILED  = 2,
	EC_LIVESTREAM_TIMEOUT      = 3,//超时
	EC_LIVESTREAM_PUSH_SUCCESS = 4,//推流成功
	EC_LIVESTREAM_PUSH_FAILED  = 5,//推流失败
	EC_LIVESTREAM_PLAY_SUCCESS = 6,//播流成功
	EC_LIVESTREAM_PLAY_FAILED  = 7,//播流失败
	EC_LIVESTREAM_DISCONNECTED = 8, //断开
	EC_LIVESTREAM__FINISHED = 9,
}EC_LiveStreamStatusCode;

/****************************VOIP回调接口******************************/
typedef void(*onEcLiveStreamNetworkStatus)(int status);//直播连接回调。 handle 句柄； status 参考EC_LiveStreamStatusCode

#endif