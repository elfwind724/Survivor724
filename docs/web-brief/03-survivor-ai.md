# 幸存者 AI

NPC 不是派遣后消失。必须真实走路、领工具、工作、把资源装进背包、返回卸货。

白天状态机：

Idle → AcquireEquipment → TravelToTarget → Work → CollectOutput → ReturnToBase → DepositItems

没有对应工具就不能做对应工作。背包满了必须返回。仓库满了不能凭空入库。

任务由世界需求生成，再按岗位、技能、距离和规则选人。
