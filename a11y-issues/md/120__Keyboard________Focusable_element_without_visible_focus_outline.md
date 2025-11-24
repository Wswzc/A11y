# [Keyboard][用户中心] Focusable element without visible focus outline

**页面**: 用户中心

**优先级**: Moderate

**标签**: keyboard,focus

**问题描述**:

Page: 用户中心
Tag: BUTTON
Role: 
Aria: Temporary leave，Record a 3-second video to serve as your temporary meetingpresence when you need to step away for a while，back now，button
Text: 现在离开
Computed outline: rgb(255, 255, 255) none 0px
Recommendation: provide a clear :focus-visible style (outline or box-shadow) with sufficient contrast.

**复现步骤**:

使用键盘 Tab 导航到该控件，观察是否有清晰焦点样式。

**定位 Selector**: （无）
